# michi-chat

**Documentation: <https://beany-vu.github.io/michi-chat/>** — quickstart, admin guide, extending.

A small multi-tenant chat assistant platform. Next.js + OpenAI SDK, with LiteLLM routing to any
model provider (Ollama by default) and Postgres (pgvector) holding tenants, conversations and the
per-tenant knowledge base.

Each tenant is a business with its own persona, tools, branding, knowledge base and public embed
key. The image ships with one seeded **demo tenant** (Mugshot Artisan Cafe, sample data) so a
fresh install works immediately.

The app only ever asks LiteLLM for the aliases `michi`, `judge` and `embed`; what serves them is
`litellm.config.yaml`. That one indirection is why swapping providers is a config edit, why
provider quirks (like Ollama rejecting `encoding_format` on embeddings) are absorbed by
`drop_params` in the yaml instead of app code, and why the codebase stays small: the gateway owns
routing, keys and budgets; the app owns the loop, tenancy, RAG and evals.

## Quickstart (prebuilt image, no clone)

Grab the three files from [`examples/quickstart/`](examples/quickstart/) into an empty
directory, then:

```bash
cp .env.example .env      # set MICHI_ADMIN_PASSWORD, MICHI_CHAT_LITELLM_KEY, MICHI_DB_PASSWORD
docker compose up -d
```

- Demo chat: <http://localhost:3001> (the seeded Mugshot demo tenant)
- Admin: <http://localhost:3001/admin> — log in and create your own tenant; every form field
  (persona, branding, tools, origins, Slack webhook) is per tenant

Migrations run automatically on boot. The database must be the pgvector image (the quickstart
compose already uses it); a migration runs `CREATE EXTENSION vector`.

### Pick a model backend

**Path A — local Ollama (default).** On the machine running Docker:

```bash
ollama pull qwen3.5:4b && ollama pull qwen2.5:7b && ollama pull nomic-embed-text
```

**Path B — hosted provider.** Put your API key in `.env` and repoint the aliases in
`litellm.config.yaml` (header comment shows how). No app changes either way — that is the point
of the aliases. One caution: the `embed` alias is tied to a 768-dimension column; changing the
embedding model means a migration plus re-embedding.

### Going beyond localhost

The quickstart binds to `127.0.0.1` on purpose. Anything public-facing belongs behind a reverse
proxy that terminates TLS and sets `x-real-ip` — per-IP rate limiting only works when a trusted
proxy sets that header. The per-tenant daily message cap is what bounds the bill either way.

## Customizing and extending

- **Customize (no code):** everything a tenant is lives in the admin UI — persona, branding,
  which tool packs are enabled, knowledge-base documents, allowed origins, Slack notifications.
  Model routing lives in `litellm.config.yaml`.
- **Extend (fork + build):** a new capability is one file implementing the `ToolPack` interface
  in `src/lib/tools/` plus one line in `src/lib/tools/index.ts`. Its `configFields` auto-grow
  the admin form. Then `docker build -t my-michi .` and set `MICHI_IMAGE=my-michi` in the
  quickstart `.env`.
- **Deliberately no runtime plugin system.** Tool packs are trusted, platform-owned code; the
  security model depends on tenants supplying only *parameters*, never code or URLs (the single
  carve-out, the Slack webhook, is pinned to `hooks.slack.com`). Runtime-loaded plugins would
  dissolve exactly that boundary.

## How a turn works

```
browser ──POST /api/chat──▶ Next.js route ──OpenAI SDK──▶ LiteLLM ──▶ Ollama (or any provider)
   ◀── SSE: status → tool (live) → delta → done          tools ──▶ the tenant's configured APIs
```

The request carries a public embed key, which resolves to a tenant whose persona, tools and model
come from the database. The tool loop is hand-rolled and readable
(`src/app/api/chat/route.ts`): the model is offered tool definitions, whatever it calls is
executed and fed back, and the loop repeats until it answers in plain text. Memory is rebuilt
from the last 12 turns each request rather than held anywhere.

Note the `delta` events are not yet true token streaming: the answer is fetched whole, then
sliced. Wiring `stream: true` through a tool loop is a separate exercise, because you have to
buffer enough of each round to tell a tool call from an answer.

## Knowledge base

Markdown docs per tenant, chunked heading-aware, embedded through the LiteLLM `embed` alias into
pgvector, retrieved by the `search_kb` tool pack. Editable per tenant in the admin UI; the
CLI ingest/eval tooling below needs a repo clone (it runs on devDependencies).

## How isolation works

In descending order of how much they actually guarantee:

1. **A composite foreign key.** `messages(tenant_id, conversation_id)` references
   `conversations(tenant_id, id)`, so a message physically cannot point at another tenant's
   conversation (the kb tables repeat the pattern). Postgres enforces it and no application bug
   can get around it.
2. **A repository layer.** `forTenant()` in `src/db/tenant-db.ts` pre-applies the tenant
   predicate. The raw handle is called `dbRoot` so an unscoped query stands out in review.
3. **Row-Level Security: deliberately absent.** The `michi` role is a Postgres superuser, and
   superusers bypass RLS unconditionally (`FORCE ROW LEVEL SECURITY` does not help). Adding
   policies today would be inert. It needs a `NOSUPERUSER` application role first, plus every
   scoped query inside a transaction that calls `set_config('app.tenant_id', …, true)` — because
   the connection pool would otherwise leak a bare `SET` to the next request.

The public embed key is a tenant **selector**, not a credential: it ships in the customer's page
source. The Origin allowlist is browser-enforced, so it stops another website embedding a
tenant's bot but does nothing against a direct request. The per-tenant daily cap is the control
that actually protects the bill.

## Developing

Clone the repo; the root `docker-compose.yml` is the dev stack (bind mount, HMR, migrations on
boot). Ollama must be reachable from the containers; on WSL set `MICHI_OLLAMA_HOST` in `.env` to
the distro's eth0 IP.

```bash
cp .env.example .env
docker compose up -d                              # app :3001 · LiteLLM :4000 · Postgres :5435
docker compose exec app npm test                  # prompt assembly, origin matching, tool packs, chunking, slack pin
docker compose exec app npm run test:isolation    # cross-tenant guarantees, needs the DB
docker compose exec app npm run kb:ingest -- mugshot   # (re)embed kb/mugshot/*.md
docker compose exec app npm run kb:eval -- mugshot     # recall@k over eval/kb-golden.json
```

The isolation suite asserts on the constraint *name*, so it proves the composite foreign key is
what rejected the write rather than some incidental failure.

Production image: `docker build -t michi-chat:local .` — multi-stage, Next standalone output,
migrations applied on boot by `docker/entrypoint.mjs` (drizzle-orm's programmatic migrator, same
`__drizzle_migrations` table as drizzle-kit). Publishing happens from
`.github/workflows/docker-publish.yml` on `v*` tags; GHCR packages start private, flip to public
once after the first publish.

### Schema changes

```bash
docker compose exec app npm run db:generate     # after editing src/db/schema.ts
```

Then read the generated SQL before committing it. Anything that adds a `NOT NULL` column to a
table with rows needs a hand-written seed/backfill/`SET NOT NULL` sequence, and drizzle-kit will
not write that for you. `drizzle/0001_tenants.sql` is the worked example; `0003` adds the
pgvector extension by hand for the same reason.
