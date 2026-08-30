// The whole schema on one screen. Multi-tenant: every visitor-facing row carries a
// tenantId, and isolation is enforced by Postgres (composite foreign keys) rather than
// by remembering to write the right WHERE clause. kb tables land here when RAG does.

import { desc } from "drizzle-orm";
import {
  boolean,
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

// 768 = nomic-embed-text via the LiteLLM alias `embed`; kb_chunks and answer_cache
// are both sized to it, so changing the embedding model is a migration + re-embed.
export const EMBEDDING_DIMENSIONS = 768;

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
  /** Widget theme: absent = follow the visitor's system; "light"/"dark" pin it. */
  theme?: "light" | "dark";
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
  // IANA zone ("Asia/Manila"). Owns two boundaries: analytics day/hour buckets, and when
  // the daily cap resets — a Manila cafe's cap must reset at Manila midnight, not the
  // server's. Validated with Intl on save.
  timezone: text("timezone").notNull().default("UTC"),
  // Privacy switch: when false, no conversation or message rows are written at all.
  // Two consequences, both deliberate: the bot loses multi-turn memory (history is
  // rebuilt from these rows), and the daily cap is enforced via rate_buckets instead
  // of counting messages. See the chat route.
  storeConversations: boolean("store_conversations").notNull().default(true),
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
    // ISO country code from Cloudflare's cf-ipcountry header when the platform runs
    // behind it; deliberately NOT the IP. Country-level is analytics, an IP is a liability.
    country: text("country"),
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

// Operator accounts for /admin. Two roles:
//   owner — everything: tenants, keys, origins, tools, users.
//   staff — the day-to-day: read conversations/usage, manage knowledge-base documents.
// The env ADMIN_PASSWORD remains a break-glass OWNER login (no row here), so a fresh
// install works before any user exists and a forgotten password never locks the door.
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Format "scrypt:<saltHex>:<hashHex>"; per-user random salt.
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "staff"] })
    .notNull()
    .default("staff"),
  status: text("status", { enum: ["active", "disabled"] })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

// Sessions for /admin. userId is null for env-password (break-glass owner) sessions;
// the role is snapshotted at login so every request costs one lookup, and disabling a
// user still bites within a session's 12h TTL via the join check in getAdminSession.
export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").references(() => adminUsers.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "staff"] })
    .notNull()
    .default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Semantic answer cache: opening-hours-style questions dominate real traffic (the
// analytics page proves it), and a paraphrase of an already-answered opener can be
// served instantly at zero token cost. Only FIRST messages of a conversation are ever
// cached or served from here (follow-ups depend on history), rows are wiped whenever
// the tenant's knowledge or settings change, and privacy-mode tenants skip it entirely.
// No ANN index, same reasoning as kb_chunks.
export const answerCache = pgTable(
  "answer_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    answer: text("answer").notNull(),
    model: text("model"),
    hits: integer("hits").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("answer_cache_tenant_idx").on(t.tenantId)],
);

// Append-only trail of who did what in the admin. Never updated, never joined for
// authorization — purely forensic, so multi-user access has a memory. actorUserId is
// null for the env-password (break-glass) owner; actorLabel keeps the row readable even
// if the user is later deleted.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    subject: text("subject").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(desc(t.createdAt))],
);

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
