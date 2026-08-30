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

/** Upserts by slug. Returns a human summary or throws with a human reason. */
export async function importTenant(payload: unknown): Promise<string> {
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

  let kbCount = 0;
  for (const doc of (data.kb ?? []).slice(0, 200)) {
    if (!doc?.title?.trim() || !doc?.content?.trim()) continue;
    await ingestDocument({ tenantId, title: doc.title.trim(), content: doc.content });
    kbCount += 1;
  }
  await clearAnswerCache(tenantId);

  return `${created ? "Created" : "Updated"} '${t.slug}': settings applied, ${kbCount} KB documents re-embedded.`;
}
