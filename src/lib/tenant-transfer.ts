// Whole-tenant export/import: everything that makes a tenant a tenant (persona, branding,
// tool config, origins, settings) plus its knowledge base, as one JSON file. The use case
// is moving a configured tenant between instances (laptop → production), so import
// RE-EMBEDS the KB through the destination's embed model - vectors never travel, because
// embedding spaces don't transfer.
//
// Import validates as strictly as the admin form does: origins normalized, tool URLs
// through the same SSRF gate, Slack pinned, timezone Intl-checked, unknown packs dropped.
// A file is untrusted input even when an owner uploads it.

import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { dbRoot } from "@/db";
import { apiKeys, tenants, kbDocuments, type Branding, type ToolConfig } from "@/db/schema";
import { clearAnswerCache } from "@/lib/rag/answer-cache";
import { contentHash, ingestDocument } from "@/lib/rag";
import { chunkMarkdown } from "@/lib/rag/chunk";
import { createImportJob, finishImportJob, progressLine, runningImportJob, touchImportJob } from "@/lib/import-jobs";
import { validateSlackWebhookUrl } from "@/lib/slack";
import { normalizeOrigin } from "@/lib/tenant";
import { TOOL_PACKS } from "@/lib/tools";
import { validateBaseUrl, validatePath } from "@/lib/validate";

export const TRANSFER_FORMAT = "michi-tenant";
export const TRANSFER_VERSION = 1;

export interface TenantTransfer {
  format: typeof TRANSFER_FORMAT;
  version: number;
  tenant: {
    slug: string;
    name: string;
    persona: string;
    guardrails: string;
    /** Absent in files from older instances: treated as "business". */
    kind?: "business" | "coach";
    model: string | null;
    branding: Branding;
    toolConfig: ToolConfig;
    allowedOrigins: string[];
    dailyMessageCap: number;
    storeConversations: boolean;
    timezone: string;
    slackWebhookUrl: string | null;
  };
  kb: { title: string; content: string }[];
}

export async function exportTenant(tenantId: string): Promise<TenantTransfer | null> {
  const [tenant] = await dbRoot.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return null;
  const documents = await dbRoot
    .select({ title: kbDocuments.title, content: kbDocuments.content })
    .from(kbDocuments)
    .where(eq(kbDocuments.tenantId, tenantId));
  return {
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    tenant: {
      slug: tenant.slug,
      name: tenant.name,
      persona: tenant.persona,
      guardrails: tenant.guardrails,
      kind: tenant.kind,
      model: tenant.model,
      branding: tenant.branding,
      toolConfig: tenant.toolConfig,
      allowedOrigins: tenant.allowedOrigins,
      dailyMessageCap: tenant.dailyMessageCap,
      storeConversations: tenant.storeConversations,
      timezone: tenant.timezone,
      slackWebhookUrl: tenant.slackWebhookUrl,
    },
    kb: documents,
  };
}

export interface ImportPreview {
  exists: boolean;
  changes: string[];
}

/** What an import WOULD do, without doing it. Merge semantics: documents present here
 *  but absent from the file are kept, so the preview only lists adds and updates. */
export async function previewTenantImport(payload: unknown): Promise<ImportPreview> {
  const data = payload as TenantTransfer;
  if (data?.format !== TRANSFER_FORMAT || data.version !== TRANSFER_VERSION) {
    throw new Error("Not a michi tenant file (or a newer version than this instance).");
  }
  const t = data.tenant;
  const [existing] = await dbRoot.select().from(tenants).where(eq(tenants.slug, t.slug)).limit(1);
  if (!existing) {
    return { exists: false, changes: [`creates new tenant '${t.slug}' with ${data.kb?.length ?? 0} KB documents`] };
  }
  const changes: string[] = [];
  const compare: [string, unknown, unknown][] = [
    ["name", existing.name, t.name],
    ["persona", existing.persona, t.persona],
    ["kind", existing.kind, t.kind ?? "business"],
    ["model", existing.model, t.model ?? null],
    ["daily cap", existing.dailyMessageCap, Number(t.dailyMessageCap)],
    ["timezone", existing.timezone, t.timezone],
    ["store conversations", existing.storeConversations, t.storeConversations !== false],
    ["origins", existing.allowedOrigins.join(" "), (t.allowedOrigins ?? []).join(" ")],
    ["branding", JSON.stringify(existing.branding), JSON.stringify(t.branding ?? {})],
    ["tools", JSON.stringify(existing.toolConfig), JSON.stringify(t.toolConfig ?? {})],
    ["slack webhook", existing.slackWebhookUrl ?? "", t.slackWebhookUrl ?? ""],
  ];
  for (const [label, before, after] of compare) {
    if (String(before) !== String(after)) changes.push(`${label}: will change`);
  }
  const docs = await dbRoot
    .select({ title: kbDocuments.title, contentHash: kbDocuments.contentHash })
    .from(kbDocuments)
    .where(eq(kbDocuments.tenantId, existing.id));
  const byTitle = new Map(docs.map((d) => [d.title, d.contentHash]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const doc of data.kb ?? []) {
    const hash = contentHash(doc.content ?? "");
    if (!byTitle.has(doc.title)) added += 1;
    else if (byTitle.get(doc.title) !== hash) updated += 1;
    else unchanged += 1;
  }
  changes.push(`KB: ${added} new, ${updated} updated, ${unchanged} unchanged; existing extra documents are kept`);
  return { exists: true, changes };
}

export type ImportSource = "admin" | "cli";

/** What prepareTenantImport hands back: the tenant is already created/updated, the job
 *  row exists, and `run()` does the slow part (embedding) and closes the job. */
export interface PreparedImport {
  tenantId: string;
  slug: string;
  created: boolean;
  jobId: string;
  docsTotal: number;
  /** Chunks that will actually be embedded (unchanged documents are skipped by hash). */
  chunksTotal: number;
  run: () => Promise<string>;
}

/** Upserts by slug and embeds the knowledge base. Returns a human summary or throws with
 *  a human reason. The CLI uses this; the admin prepares, answers, then runs after the
 *  response so a big knowledge base never holds the browser's request open. */
export async function importTenant(payload: unknown, source: ImportSource = "cli"): Promise<string> {
  const prepared = await prepareTenantImport(payload, source);
  return prepared.run();
}

/** Validates the file, applies the settings, plans the documents and opens the job row.
 *  Throws (with a human reason) before changing anything when the file is bad or when an
 *  import for this tenant is already running. */
export async function prepareTenantImport(payload: unknown, source: ImportSource): Promise<PreparedImport> {
  const data = payload as TenantTransfer;
  if (data?.format !== TRANSFER_FORMAT || data.version !== TRANSFER_VERSION) {
    throw new Error("Not a michi tenant file (or a newer version than this instance).");
  }
  const t = data.tenant;
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(t.slug ?? "")) throw new Error("Bad slug in file.");
  if (!t.name?.trim() || !t.persona?.trim()) throw new Error("Name and persona are required.");

  // --- validate exactly like the form would -----------------------------------------
  const origins: string[] = [];
  for (const raw of t.allowedOrigins ?? []) {
    const normalized = normalizeOrigin(String(raw));
    if (!normalized) throw new Error(`Bad origin in file: ${raw}`);
    origins.push(normalized);
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: t.timezone });
  } catch {
    throw new Error(`Bad timezone in file: ${t.timezone}`);
  }
  const slackWebhookUrl = t.slackWebhookUrl ? validateSlackWebhookUrl(t.slackWebhookUrl) : null;

  const toolConfig: ToolConfig = {};
  for (const [id, rawConfig] of Object.entries(t.toolConfig ?? {})) {
    const pack = TOOL_PACKS[id];
    if (!pack || !rawConfig || typeof rawConfig !== "object") continue; // unknown pack: drop
    const config: Record<string, unknown> = { enabled: rawConfig.enabled === true };
    for (const field of pack.configFields) {
      const value = rawConfig[field.key];
      if (typeof value !== "string" || !value) continue;
      if (field.type === "url") config[field.key] = validateBaseUrl(value);
      else if (field.type === "path") config[field.key] = validatePath(value);
      else config[field.key] = value;
    }
    toolConfig[id] = config as ToolConfig[string];
  }

  const branding: Branding = {};
  const b = t.branding ?? {};
  for (const key of ["title", "subtitle", "greeting", "placeholder", "accent", "disclaimer"] as const) {
    if (typeof b[key] === "string" && b[key]) branding[key] = b[key];
  }
  if (Array.isArray(b.suggestions)) branding.suggestions = b.suggestions.map(String).slice(0, 12);
  if (b.theme === "light" || b.theme === "dark") branding.theme = b.theme;
  if (typeof b.logoUrl === "string" && b.logoUrl) {
    const url = new URL(b.logoUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Bad logo URL in file.");
    branding.logoUrl = url.toString();
  }

  const fields = {
    name: t.name.trim(),
    persona: t.persona.slice(0, 4000),
    guardrails: (t.guardrails ?? "").slice(0, 2000),
    kind: t.kind === "coach" ? ("coach" as const) : ("business" as const),
    model: t.model || null,
    branding,
    toolConfig,
    allowedOrigins: origins,
    dailyMessageCap: Math.max(1, Number(t.dailyMessageCap) || 500),
    storeConversations: t.storeConversations !== false,
    timezone: t.timezone,
    slackWebhookUrl,
    updatedAt: new Date(),
  };

  // --- upsert by slug ----------------------------------------------------------------
  const [existing] = await dbRoot
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, t.slug))
    .limit(1);
  let tenantId: string;
  let created = false;
  if (existing) {
    const live = await runningImportJob(existing.id);
    if (live) {
      throw new Error(
        `An import for '${t.slug}' is already running (${progressLine(live)}) Wait for it to finish, then try again.`,
      );
    }
    tenantId = existing.id;
    await dbRoot.update(tenants).set(fields).where(eq(tenants.id, tenantId));
  } else {
    const [row] = await dbRoot
      .insert(tenants)
      .values({ slug: t.slug, ...fields })
      .returning({ id: tenants.id });
    tenantId = row.id;
    created = true;
    // A tenant with no key cannot be visited.
    await dbRoot.insert(apiKeys).values({
      tenantId,
      kind: "public",
      name: "default",
      publicKey: `pk_${randomBytes(18).toString("base64url")}`,
    });
  }

  // --- plan the documents: which ones change, and how many chunks that is ---------------
  // Unchanged documents (same content hash) are skipped by ingestDocument; knowing that up
  // front makes the progress numbers honest ("3,210 of 7,412 chunks" counts real work).
  const docs = (data.kb ?? [])
    .slice(0, 200)
    .filter((doc) => doc?.title?.trim() && doc?.content?.trim())
    .map((doc) => ({ title: doc.title.trim(), content: doc.content }));
  const existingHashes = new Map(
    (
      await dbRoot
        .select({ title: kbDocuments.title, contentHash: kbDocuments.contentHash })
        .from(kbDocuments)
        .where(eq(kbDocuments.tenantId, tenantId))
    ).map((row) => [row.title, row.contentHash]),
  );
  const plan = docs.map((doc) => {
    const unchanged = existingHashes.get(doc.title) === contentHash(doc.content);
    return { ...doc, chunks: unchanged ? 0 : chunkMarkdown(doc.content, doc.title).length };
  });
  const chunksTotal = plan.reduce((sum, doc) => sum + doc.chunks, 0);
  const jobId = await createImportJob({ tenantId, source, docsTotal: plan.length, chunksTotal });

  const run = async (): Promise<string> => {
    let docsDone = 0;
    let chunksBefore = 0;
    let current: string | null = null;
    try {
      for (const doc of plan) {
        current = doc.title;
        await touchImportJob(jobId, { docsDone, currentTitle: doc.title });
        if (doc.chunks > 0) {
          const before = chunksBefore;
          await ingestDocument(
            { tenantId, title: doc.title, content: doc.content },
            { onProgress: (done) => touchImportJob(jobId, { chunksDone: before + done }) },
          );
          chunksBefore += doc.chunks;
        }
        docsDone += 1;
        if (source === "cli") console.log(`  ${docsDone}/${plan.length} ${doc.title}: ${doc.chunks > 0 ? `${doc.chunks} chunks` : "unchanged"}`);
      }
      current = null;
      await clearAnswerCache(tenantId);
      const summary = `${created ? "Created" : "Updated"} '${t.slug}': settings applied, ${plan.length} KB documents (${chunksTotal.toLocaleString("en-US")} chunks embedded, unchanged ones skipped).`;
      await finishImportJob(jobId, { status: "done", message: summary, docsDone, chunksDone: chunksTotal });
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await touchImportJob(jobId, { currentTitle: current });
      await finishImportJob(jobId, { status: "failed", message, docsDone, chunksDone: chunksBefore });
      throw error;
    }
  };

  return { tenantId, slug: t.slug, created, jobId, docsTotal: plan.length, chunksTotal, run };
}
