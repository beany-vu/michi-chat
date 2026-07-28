# michi-chat

A small multi-tenant chat assistant platform. Next.js + OpenAI SDK, with LiteLLM routing to any
model provider (Ollama in dev) and Postgres (pgvector) holding tenants, conversations and, soon,
the knowledge base.

Each tenant is a business with its own persona, tools, branding and public embed key. The first
is Mugshot Artisan Cafe.

## Run

```bash
cp .env.example .env      # set MICHI_OLLAMA_HOST to this machine's WSL eth0 IP
docker compose up -d      # app :3001 · LiteLLM :4000 · Postgres :5435
```

- Chat: <http://localhost:3001> (redirects to the default tenant at `/t/mugshot`)
- Admin: <http://localhost:3001/admin> (password from `MICHI_ADMIN_PASSWORD`)

Requires Ollama running locally with `qwen3.5:4b` pulled.

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

## How isolation works

In descending order of how much they actually guarantee:

1. **A composite foreign key.** `messages(tenant_id, conversation_id)` references
   `conversations(tenant_id, id)`, so a message physically cannot point at another tenant's
   conversation. Postgres enforces it and no application bug can get around it.
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

## Tests

```bash
docker compose exec app npm test                # prompt assembly, origin matching, tool packs
docker compose exec app npm run test:isolation  # cross-tenant guarantees, needs the DB
```

The isolation suite asserts on the constraint *name*, so it proves the composite foreign key is
what rejected the write rather than some incidental failure.

## Schema changes

```bash
docker compose exec app npm run db:generate     # after editing src/db/schema.ts
```

Then read the generated SQL before committing it. Anything that adds a `NOT NULL` column to a
table with rows needs a hand-written seed/backfill/`SET NOT NULL` sequence, and drizzle-kit will
not write that for you. `drizzle/0001_tenants.sql` is the worked example.
