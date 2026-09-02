"use server";

// Every admin mutation. Server Actions rather than route handlers for one concrete
// reason: Next.js gives actions built-in CSRF protection (it compares Origin against
// Host), and route handlers get none. The chat API stays a route handler because it has
// to be callable cross-origin by a widget.
//
// requireAdmin() is the first line of each one. A guard in layout.tsx is UX only.

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { adminUsers, apiKeys, conversations, tenants, type Branding, type ToolConfig } from "@/db/schema";
import { hashPassword, login, logout, requireAdmin, requireOwner } from "@/lib/admin-auth";
import { logAudit } from "@/lib/audit";
import { parseCsv } from "@/lib/csv";
import { looksLikeProviderError } from "@/lib/moderation";
import { MAX_PDF_BYTES, MAX_POLISH_CHARS, estimateTokens, triagePdf, type PdfTriage } from "@/lib/pdf-import";
import { MAX_GUARDRAILS_CHARS, MAX_PERSONA_CHARS } from "@/lib/prompt";
import { deleteDocument, ingestDocument } from "@/lib/rag";
import { clearAnswerCache } from "@/lib/rag/answer-cache";
import { validateSlackWebhookUrl } from "@/lib/slack";
import { exportTenant, importTenant, previewTenantImport } from "@/lib/tenant-transfer";
import { normalizeOrigin } from "@/lib/tenant";
import { validateBaseUrl, validatePath } from "@/lib/validate";
import { TOOL_PACKS } from "@/lib/tools";

const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);


export async function loginAction(_prev: unknown, formData: FormData) {
  const ok = await login(
    String(formData.get("email") ?? "").trim(),
    String(formData.get("password") ?? ""),
  );
  if (!ok) return { error: "Wrong email or password." };
  redirect("/admin");
}

export async function logoutAction() {
  await requireAdmin();
  await logout();
  redirect("/admin/login");
}

export async function createTenantAction(_prev: unknown, formData: FormData) {
  const session = await requireOwner();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
    return { error: "Slug must be lowercase letters, numbers and dashes." };
  }
  if (!name) return { error: "Name is required." };

  try {
    const [tenant] = await dbRoot
      .insert(tenants)
      .values({
        slug,
        name,
        persona: `You are the AI assistant for ${name}. If you introduce yourself, say you are the ${name} assistant; never use any other name. Answer questions about the business warmly and briefly, only from tools and knowledge given to you, and never discuss how you work.`,
        allowedOrigins: ["http://localhost:3001"],
      })
      .returning({ id: tenants.id });

    // A tenant with no key cannot be visited, so mint one immediately.
    await dbRoot.insert(apiKeys).values({
      tenantId: tenant.id,
      kind: "public",
      name: "default",
      publicKey: `pk_${randomBytes(18).toString("base64url")}`,
    });
    logAudit(session, "tenant.create", slug);
    revalidatePath("/admin");
    redirect(`/admin/tenants/${tenant.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // redirect
    return { error: "That slug is already taken." };
  }
}

export async function saveTenantAction(tenantId: string, _prev: unknown, formData: FormData) {
  const session = await requireOwner();

  const persona = String(formData.get("persona") ?? "").trim();
  if (persona.length > MAX_PERSONA_CHARS) {
    return { error: `Persona must be ${MAX_PERSONA_CHARS} characters or fewer.` };
  }
  const guardrails = String(formData.get("guardrails") ?? "").trim().slice(0, MAX_GUARDRAILS_CHARS);

  const origins: string[] = [];
  for (const raw of lines(formData.get("allowedOrigins"))) {
    const normalized = normalizeOrigin(raw);
    if (!normalized) return { error: `Not a valid origin: ${raw}` };
    origins.push(normalized);
  }

  // Rebuild toolConfig from the packs, so a tenant can never hold config for a pack that
  // does not exist, and never enable one that was not offered in the form.
  const toolConfig: ToolConfig = {};
  try {
    for (const pack of Object.values(TOOL_PACKS)) {
      const enabled = formData.get(`tool.${pack.id}.enabled`) === "on";
      const config: Record<string, unknown> = { enabled };
      for (const field of pack.configFields) {
        const value = String(formData.get(`tool.${pack.id}.${field.key}`) ?? "").trim();
        if (!value) {
          if (enabled && field.required) throw new Error(`${pack.label}: ${field.label} is required`);
          continue;
        }
        if (field.type === "url") config[field.key] = validateBaseUrl(value);
        else if (field.type === "path") config[field.key] = validatePath(value);
        else config[field.key] = value;
      }
      toolConfig[pack.id] = config as ToolConfig[string];
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid tool config." };
  }

  // The one tenant-supplied URL, allowed only because validation pins it to exactly
  // https://hooks.slack.com/services/… (see src/lib/slack.ts for the SSRF reasoning).
  let slackWebhookUrl: string | null = null;
  const rawWebhook = String(formData.get("slackWebhookUrl") ?? "").trim();
  if (rawWebhook) {
    try {
      slackWebhookUrl = validateSlackWebhookUrl(rawWebhook);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Invalid Slack webhook." };
    }
  }

  const timezone = String(formData.get("timezone") ?? "").trim() || "UTC";
  try {
    // Throws on anything Postgres would also choke on; one gate for both consumers.
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: `Not a valid timezone: ${timezone} (use an IANA name like Asia/Manila).` };
  }

  const branding: Branding = {
    title: String(formData.get("brand.title") ?? "").trim() || undefined,
    subtitle: String(formData.get("brand.subtitle") ?? "").trim() || undefined,
    greeting: String(formData.get("brand.greeting") ?? "").trim() || undefined,
    placeholder: String(formData.get("brand.placeholder") ?? "").trim() || undefined,
    accent: String(formData.get("brand.accent") ?? "").trim() || undefined,
    suggestions: lines(formData.get("brand.suggestions")),
    disclaimer: String(formData.get("brand.disclaimer") ?? "").trim() || undefined,
  };
  const theme = String(formData.get("brand.theme") ?? "");
  if (theme === "light" || theme === "dark") branding.theme = theme;

  // Browser-rendered only (img src in the visitor's page), so unlike tool base URLs this
  // needs no internal-host blocking - but it must be https and carry no credentials.
  const rawLogo = String(formData.get("brand.logoUrl") ?? "").trim();
  if (rawLogo) {
    try {
      const url = new URL(rawLogo);
      if (url.protocol !== "https:") throw new Error("must be https");
      if (url.username || url.password) throw new Error("credentials are not allowed");
      branding.logoUrl = url.toString();
    } catch (error) {
      return { error: `Logo URL: ${error instanceof Error ? error.message : "invalid"}` };
    }
  }

  await dbRoot
    .update(tenants)
    .set({
      name: String(formData.get("name") ?? "").trim(),
      status: formData.get("status") === "disabled" ? "disabled" : "active",
      model: String(formData.get("model") ?? "").trim() || null,
      dailyMessageCap: Math.max(1, Number(formData.get("dailyMessageCap")) || 500),
      persona,
      guardrails,
      branding,
      toolConfig,
      allowedOrigins: origins,
      timezone,
      storeConversations: formData.get("storeConversations") === "on",
      slackWebhookUrl,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  // Persona/tools/settings feed every answer; cached ones are now suspect.
  void clearAnswerCache(tenantId);
  logAudit(session, "tenant.update", String(formData.get("name") ?? tenantId));
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function createKeyAction(tenantId: string, formData: FormData) {
  const session = await requireOwner();
  await dbRoot.insert(apiKeys).values({
    tenantId,
    kind: "public",
    name: String(formData.get("name") ?? "").trim() || "untitled",
    publicKey: `pk_${randomBytes(18).toString("base64url")}`,
  });
  logAudit(session, "key.create", tenantId);
  revalidatePath(`/admin/tenants/${tenantId}/keys`);
}

const MAX_KB_DOC_CHARS = 100_000;

export async function saveKbDocumentAction(tenantId: string, _prev: unknown, formData: FormData) {
  const session = await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title) return { error: "Title is required." };
  if (!content) return { error: "Content is required." };
  if (content.length > MAX_KB_DOC_CHARS) {
    return { error: `Content must be ${MAX_KB_DOC_CHARS} characters or fewer.` };
  }

  try {
    const chunks = await ingestDocument({ tenantId, title, content });
    logAudit(session, "kb.save", title);
    revalidatePath(`/admin/tenants/${tenantId}/kb`);
    return {
      ok: true as const,
      info: chunks === -1 ? "Unchanged, nothing re-embedded." : `Embedded ${chunks} chunks.`,
    };
  } catch (error) {
    console.error("kb ingest failed", error);
    // The embedding service being down is the realistic failure; say that, not a stack.
    return { error: "Ingestion failed. Is the embedding model reachable through LiteLLM?" };
  }
}

export async function deleteKbDocumentAction(tenantId: string, documentId: string) {
  const session = await requireAdmin();
  await deleteDocument(tenantId, documentId);
  logAudit(session, "kb.delete", documentId);
  revalidatePath(`/admin/tenants/${tenantId}/kb`);
}

export async function revokeKeyAction(tenantId: string, keyId: string) {
  const session = await requireOwner();
  // Soft revoke: conversations keep a valid foreign key, and traffic still arriving on a
  // dead key stays visible.
  await dbRoot
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)));
  logAudit(session, "key.revoke", keyId);
  revalidatePath(`/admin/tenants/${tenantId}/keys`);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createAdminUserAction(_prev: unknown, formData: FormData) {
  const session = await requireOwner();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "owner" ? ("owner" as const) : ("staff" as const);

  if (!EMAIL_PATTERN.test(email)) return { error: "Not a valid email." };
  if (!name) return { error: "Name is required." };
  if (password.length < 10) return { error: "Password must be at least 10 characters." };

  try {
    await dbRoot.insert(adminUsers).values({
      email,
      name,
      role,
      passwordHash: await hashPassword(password),
    });
  } catch {
    return { error: "That email already has an account." };
  }
  logAudit(session, "user.create", `${email} (${role})`);
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function setAdminUserStatusAction(userId: string, status: "active" | "disabled") {
  const session = await requireOwner();
  // Disabling rather than deleting keeps the audit trail; a disabled user's sessions die
  // on their next request (getAdminSession re-checks status).
  await dbRoot
    .update(adminUsers)
    .set({ status: status === "disabled" ? "disabled" : "active" })
    .where(eq(adminUsers.id, userId));
  logAudit(session, "user.status", `${userId} -> ${status}`);
  revalidatePath("/admin/users");
}

export async function setConversationFlagAction(conversationId: string, flagged: boolean) {
  // Staff can flag too: spotting a malicious chat is day-to-day conversation reading,
  // not tenant administration.
  const session = await requireAdmin();
  await dbRoot
    .update(conversations)
    .set(flagged ? { flaggedAt: new Date(), flagReason: "manual" } : { flaggedAt: null, flagReason: null })
    .where(eq(conversations.id, conversationId));
  logAudit(session, flagged ? "conversation.flag" : "conversation.unflag", conversationId);
  revalidatePath("/admin/conversations");
  revalidatePath(`/admin/conversations/${conversationId}`);
}

export async function deleteConversationAction(conversationId: string) {
  const session = await requireOwner();
  // Messages go with it via the composite-FK cascade. Deletion is real and final;
  // export first if the transcript matters.
  await dbRoot.delete(conversations).where(eq(conversations.id, conversationId));
  logAudit(session, "conversation.delete", conversationId);
  revalidatePath("/admin/conversations");
  redirect("/admin/conversations");
}

const MAX_KB_IMPORT_ROWS = 200;

export async function importKbCsvAction(tenantId: string, _prev: unknown, formData: FormData) {
  const session = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first." };
  if (file.size > 5_000_000) return { error: "CSV is larger than 5 MB." };

  const rows = parseCsv(await file.text());
  if (rows.length === 0) return { error: "The CSV is empty." };
  // A header row is expected (the export writes one) but optional.
  const body = rows[0][0]?.trim().toLowerCase() === "title" ? rows.slice(1) : rows;
  if (body.length > MAX_KB_IMPORT_ROWS) {
    return { error: `Too many rows (${body.length}); the limit is ${MAX_KB_IMPORT_ROWS}.` };
  }

  let saved = 0;
  let unchanged = 0;
  const problems: string[] = [];
  for (const [index, row] of body.entries()) {
    const title = (row[0] ?? "").trim();
    const content = (row[1] ?? "").trim();
    if (!title || !content) {
      problems.push(`row ${index + 1}: needs both title and content`);
      continue;
    }
    try {
      const chunks = await ingestDocument({ tenantId, title, content });
      if (chunks === -1) unchanged += 1;
      else saved += 1;
    } catch {
      problems.push(`row ${index + 1} ("${title.slice(0, 40)}"): embedding failed`);
    }
  }

  logAudit(session, "kb.import", `${saved} saved, ${unchanged} unchanged, ${problems.length} failed`);
  revalidatePath(`/admin/tenants/${tenantId}/kb`);
  if (problems.length > 0) {
    return { error: `Imported ${saved}, unchanged ${unchanged}; problems: ${problems.slice(0, 3).join("; ")}` };
  }
  return { ok: true as const, info: `${saved} imported, ${unchanged} unchanged.` };
}

// --- PDF → knowledge base ------------------------------------------------------------
// Two-step flow, and the split is the point: analyze is FREE (parse + deterministic
// cleanup + token estimate + targeted suggestions), and the model pass only runs after
// the owner has seen the price and had the chance to trim. See src/lib/pdf-import.ts.

export async function analyzePdfAction(_prev: unknown, formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF file first." };
  if (file.size > MAX_PDF_BYTES) return { error: "PDF is larger than 10 MB." };

  let pages: string[];
  try {
    // Dynamic import on purpose: actions.ts is loaded by every admin page, and pdf.js
    // is heavy. Only the analyze click pays for it.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: false });
    pages = extracted.text;
  } catch (error) {
    console.error("pdf extraction failed", error);
    return { error: "Could not read that PDF. Is it password-protected or corrupted?" };
  }

  const triage: PdfTriage = triagePdf(pages);
  // The editor has to hold this in a browser; a monster extraction gets cut with a note.
  const EDITOR_CAP = 300_000;
  if (triage.text.length > EDITOR_CAP) {
    triage.text = triage.text.slice(0, EDITOR_CAP);
    triage.suggestions.push(
      `This file extracted to more than ${EDITOR_CAP.toLocaleString()} characters; only the first ${EDITOR_CAP.toLocaleString()} are shown below. Import it topic by topic instead.`,
    );
  }
  if (triage.text.length === 0) {
    return {
      error: triage.likelyScanned
        ? "No selectable text in this PDF: it is scanned images, which the bot cannot read. Re-export it as text, or type the facts into a document instead."
        : "That PDF contains no text.",
    };
  }
  return { ok: true as const, triage };
}

const POLISH_SYSTEM_PROMPT = [
  "You turn raw text extracted from a business document (usually a PDF) into a clean",
  "knowledge-base document for a customer-facing assistant.",
  "Rules:",
  "- Keep every real fact; never invent, guess, or embellish. Numbers, names, prices,",
  "  dates and hours stay exactly as written.",
  "- Organize into short Markdown sections: one ## heading per topic (hours, location,",
  "  menu, policies, contact), with a few plain sentences or a short list under each.",
  "- Drop layout leftovers: page numbers, repeated headers or footers, tables of",
  "  contents, decoration.",
  "- Rewrite table fragments as plain sentences when the meaning is clear; if a fragment",
  "  is unreadable, drop it rather than guess.",
  "- Write in the same language as the source text.",
  "- Reply with ONLY the Markdown document: no preamble, no commentary, no code fences.",
].join("\n");

export async function polishKbTextAction(tenantId: string, _prev: unknown, formData: FormData) {
  const session = await requireAdmin();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Nothing to tidy: the text box is empty." };
  if (text.length > MAX_POLISH_CHARS) {
    return {
      error: `Too much text for one AI pass (${text.length.toLocaleString()} characters; the limit is ${MAX_POLISH_CHARS.toLocaleString()}). Delete more below, or split it into one import per topic.`,
    };
  }

  const [tenant] = await dbRoot
    .select({ model: tenants.model })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) return { error: "Tenant not found." };
  const model = tenant.model ?? process.env.CHAT_MODEL ?? "michi";

  try {
    const openai = new OpenAI({
      baseURL: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
      apiKey: process.env.LITELLM_API_KEY ?? "sk-michi-dev",
    });
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      // Runaway guard: cleanup output should be SMALLER than its input. On a provider
      // that leaks thinking tokens this truncates into a visible error instead of a
      // silent bill (prod's aliases carry enable_thinking:false in litellm config).
      max_tokens: Math.min(16_384, estimateTokens(text.length) + 2_048),
      messages: [
        { role: "system", content: POLISH_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });
    let markdown = (completion.choices[0]?.message?.content ?? "").trim();
    // Belt and braces: the prompt forbids fences, models add them anyway.
    markdown = markdown.replace(/^```(?:markdown)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    // House style, same as the chat route: no em/en dashes in anything the bot serves.
    markdown = markdown.replaceAll("—", ", ").replaceAll(" – ", ", ").replaceAll("–", "-");
    if (!markdown || looksLikeProviderError(markdown)) {
      console.error("pdf polish returned error content:", markdown.slice(0, 300));
      return { error: "The model could not process this text. Try a smaller piece." };
    }
    const tokensIn = completion.usage?.prompt_tokens ?? 0;
    const tokensOut = completion.usage?.completion_tokens ?? 0;
    logAudit(session, "kb.pdf-polish", `${text.length} chars, ${tokensIn}->${tokensOut} tokens`);
    return { ok: true as const, markdown, tokensIn, tokensOut };
  } catch (error) {
    console.error("pdf polish failed", error);
    return { error: "The AI pass failed. Is the model reachable through LiteLLM?" };
  }
}

export async function importTenantAction(_prev: unknown, formData: FormData) {
  const session = await requireOwner();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a tenant JSON file." };
  if (file.size > 10_000_000) return { error: "File is larger than 10 MB." };
  try {
    const payload = JSON.parse(await file.text());
    const preview = await previewTenantImport(payload);
    // Existing tenant + no explicit confirmation = show the diff, change nothing.
    if (preview.exists && formData.get("confirm") !== "on") {
      return { preview: preview.changes };
    }
    const summary = await importTenant(payload);
    logAudit(session, "tenant.import", summary);
    revalidatePath("/admin");
    return { ok: true as const, info: summary };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Import failed." };
  }
}
