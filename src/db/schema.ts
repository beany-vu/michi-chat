// The whole schema on one screen. Multi-tenant: every visitor-facing row carries a
// tenantId, and isolation is enforced by Postgres (composite foreign keys) rather than
// by remembering to write the right WHERE clause. kb tables land here when RAG does.

import { desc } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** Per-pack settings, e.g. { get_menu: { enabled: true, baseUrl: "https://..." } }. */
export type ToolConfig = Record<string, { enabled: boolean } & Record<string, unknown>>;

export interface Branding {
  title?: string;
  subtitle?: string;
  greeting?: string;
  placeholder?: string;
  accent?: string;
  suggestions?: string[];
  /** Visitor-facing notice under the composer: privacy ("don't share sensitive info")
   *  and scope ("I only answer questions about this business"). Admin-composed. */
  disclaimer?: string;
  /** https URL of the tenant's logo, shown in the chat header. Rendered by the
   *  visitor's browser only — this server never fetches it, so the no-tenant-URLs
   *  (SSRF) rule does not apply. */
  logoUrl?: string;
}

// One row per cafe. Everything that used to be a constant in the code (persona, tool
// wiring, suggestion chips) is a column here, which is what makes tenant #2 free.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "disabled"] })
    .notNull()
    .default("active"),
  // The L1 layer of the system prompt. Never the whole prompt: see src/lib/prompt.ts.
  persona: text("persona").notNull(),
  // LiteLLM alias override; null means fall back to CHAT_MODEL.
  model: text("model"),
  branding: jsonb("branding").$type<Branding>().notNull().default({}),
  toolConfig: jsonb("tool_config").$type<ToolConfig>().notNull().default({}),
  // Browser-enforced scoping for the embed, stored as "scheme://host[:port]", lowercased.
  allowedOrigins: text("allowed_origins").array().notNull().default([]),
  dailyMessageCap: integer("daily_message_cap").notNull().default(500),
  // The ONE tenant-supplied URL in the system, and only because it is pinned to a single
  // host: validation (src/lib/slack.ts) accepts exactly https://hooks.slack.com/services/…,
  // so it cannot be aimed at Ollama, the DB, or LiteLLM. Notifies on new conversations
  // and on the day's cap being reached.
  slackWebhookUrl: text("slack_webhook_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A public key ships in the customer's page source, so it is a TENANT SELECTOR, NOT A
// CREDENTIAL: every control downstream of it must hold against curl. It is stored in
// plaintext for that reason. A secret key (server-to-server) is a real credential and is
// stored only as a hash. /api/chat must reject kind="secret" and admin must reject
// kind="public" — one lookup shared by both surfaces is the classic hole.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["public", "secret"] })
      .notNull()
      .default("public"),
    name: text("name").notNull(),
    publicKey: text("public_key").unique(),
    secretHash: text("secret_hash").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // Soft revoke, so conversations keep a valid FK and traffic on a dead key stays visible.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_tenant_idx").on(t.tenantId)],
);

// Server-issued visitor identity. Replaces the old client-supplied anonId, which the
// client minted itself and could therefore be anything — useless as an auth factor and
// useless as a rate-limit key (infinite cardinality).
export const widgetSessions = pgTable(
  "widget_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("widget_sessions_tenant_idx").on(t.tenantId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => widgetSessions.id, { onDelete: "set null" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    // Which site the turn came from. Forensics only; Origin is trivially forged off-browser.
    originHost: text("origin_host"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Not redundant with the PK: it is the target of the composite FK on messages below.
    unique("conversations_tenant_id_key").on(t.tenantId, t.id),
    index("conversations_tenant_idx").on(t.tenantId, desc(t.lastMessageAt)),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalized on purpose. Two reasons: the composite FK below needs it, and the
    // future kb_chunks vector search is a direct leaf scan with no join to filter on.
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls"),
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The isolation guarantee, and the highest value-per-line in the schema: a message
    // physically CANNOT point at another tenant's conversation. Postgres enforces it, so
    // no application bug can produce a cross-tenant row.
    foreignKey({
      columns: [t.tenantId, t.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
      name: "messages_tenant_conversation_fk",
    }).onDelete("cascade"),
    index("messages_conversation_idx").on(t.conversationId, desc(t.createdAt)),
    index("messages_tenant_created_idx").on(t.tenantId, desc(t.createdAt)),
  ],
);

// Operator sessions for /admin. Single operator, so there is no users table: the password
// hash lives in an env var and this only tracks issued sessions so they can be revoked.
export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Fixed-window counters. In Postgres rather than an in-process Map because a Map silently
// resets on every dev HMR reload, so you could never tell whether it worked.
export const rateBuckets = pgTable(
  "rate_buckets",
  {
    bucketKey: text("bucket_key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucketKey, t.windowStart] })],
);

// --- The RAG tables -----------------------------------------------------------------
// Two rules that were decided before these existed, because they are expensive to
// change later:
//
//   1. tenantId goes DIRECTLY on kb_chunks, not reached through kb_documents. Retrieval
//      is `where tenant_id = $1 order by embedding <=> $2 limit k` — a leaf scan with no
//      join to hang the filter on.
//   2. Do NOT add an HNSW/IVFFlat index at first. pgvector POST-filters: the index picks
//      ef_search nearest rows globally, THEN applies tenant_id, so a small tenant can get
//      back fewer than k rows (or zero) while having plenty of relevant chunks. An exact
//      scan with a btree on tenant_id is correct and fast to ~50k chunks/tenant. Past
//      that, pgvector 0.8.4 (already on the image) has hnsw.iterative_scan, which is the
//      real fix.
//
// 768 dimensions = nomic-embed-text, served through the LiteLLM alias `embed`. Changing
// the embedding model means a migration AND re-embedding every chunk; the dimension
// lives here so that fact is impossible to miss.

export const EMBEDDING_DIMENSIONS = 768;

// The source of truth a tenant's operator edits: full markdown, stored verbatim so
// chunks can always be rebuilt (re-chunk, re-embed) without asking for the text again.
export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    // sha256 of content; lets ingestion skip the embedding pass when nothing changed.
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target of the composite FK on kb_chunks, same pattern as conversations/messages.
    unique("kb_documents_tenant_id_key").on(t.tenantId, t.id),
    unique("kb_documents_tenant_title_key").on(t.tenantId, t.title),
  ],
);

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull(),
    // Heading breadcrumb ("Menu > Espresso drinks"), prepended at retrieval time so the
    // model sees where a chunk came from.
    heading: text("heading").notNull().default(""),
    content: text("content").notNull(),
    position: integer("position").notNull().default(0),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    // Same isolation guarantee as messages: a chunk physically cannot point at another
    // tenant's document.
    foreignKey({
      columns: [t.tenantId, t.documentId],
      foreignColumns: [kbDocuments.tenantId, kbDocuments.id],
      name: "kb_chunks_tenant_document_fk",
    }).onDelete("cascade"),
    // The btree that makes the exact scan cheap. Deliberately NO vector index: see above.
    index("kb_chunks_tenant_idx").on(t.tenantId),
    index("kb_chunks_document_idx").on(t.documentId),
  ],
);
