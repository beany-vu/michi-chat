# michi-chat

A multi-tenant chat assistant platform: Next.js (App Router) + OpenAI SDK + LiteLLM proxy +
Drizzle/Postgres (pgvector image, RAG-ready). Each tenant is a business with its own persona,
tools, branding and public embed key; the first is Mugshot Artisan Cafe.

Started as the deliberate SIMPLE rebuild of `~/projects/michi-chatbot` (.NET). LiteLLM removed
that project's infrastructure half (provider routing, keys, budgets), which is why the platform
half could be rebuilt small. The .NET repo stays as reference and portfolio; its learning docs
live in `~/projects/ai-docs/michi-chatbot/` and the concepts (tools, RAG, evals, guardrails)
carry over 1:1.

## Rules

- **Commit messages: never mention AI assistance.** No Co-Authored-By trailers, no tool names.
- **Everything runs via docker**: `docker compose up -d` (app :3001, LiteLLM :4000, Postgres :5435).
  Never run the app or db directly on the host.
- Ollama must be running in this WSL distro (`ollama serve`); `MICHI_OLLAMA_HOST` in `.env` is the
  distro's eth0 IP and can change after a WSL restart (`ip addr show eth0`).
- Model routing lives in `litellm/config.yaml` — the app only knows the aliases `michi` and
  `judge`. Swapping providers (Ollama → DashScope/OpenAI) is config, never code.
- Bot copy style: no em-dashes or en-dashes (enforced in the chat route, not just the persona).
- The bot must never invent facts, prices, or availability: tools + honesty ("say so if you
  don't know"). Prices are not published online; point to the counter or FoodPanda.
- **Schema changes go through migrations**, never `drizzle-kit push`. Generate, then hand-edit
  when existing rows need a backfill. Running both drifts the DB from its own history.

### Multi-tenant rules

- **No tenant-supplied URLs.** Tools are code packs in `src/lib/tools/`; a tenant enables one and
  fills in parameters. This process can reach an unauthenticated Ollama on the host, so a
  free-form URL field would be an SSRF hole.
- **The admin conversation viewer renders message content as plain text**, never markdown and
  never HTML. The visitor widget renders markdown, which is fine there; the operator's browser
  holds the session that controls the whole platform.
- **`requireAdmin()` is the first line of every server action.** A guard in `admin/layout.tsx`
  does not protect actions: they run before the layout re-renders.
- **CORS is emitted by the chat route handler only**, never globally. A permissive Allow-Origin
  on an admin response would let any tenant page read admin JSON with the operator's cookie.
- The public embed key is a **tenant selector, not a credential**. Every control downstream of it
  must hold against `curl`. The per-tenant daily cap is what protects the bill; the Origin
  allowlist is browser-enforced scoping, nothing more.

## Layout

- `src/app/api/chat/route.ts` — SSE chat turn: hand-rolled tool loop (status/tool/delta/done)
- `src/lib/tenant.ts` — embed-key resolution, origin allowlist, sessions, CORS helpers
- `src/lib/prompt.ts` — system prompt assembly, three trust levels
- `src/lib/tools/` — pack registry, the mugshot packs, and `index.ts` which turns a tenant's
  `toolConfig` into definitions + labels + one executor
- `src/db/schema.ts` — tenants, api_keys, widget_sessions, conversations, messages, admin_sessions
- `src/db/tenant-db.ts` — `forTenant()`, the tenant-scoped query helpers
- `src/app/admin/` — the operator UI (server components + server actions)
- `src/components/ChatPanel.tsx` — the chat UI, fully driven by props
- `litellm/config.yaml` — model aliases → real providers

## Commands

```bash
docker compose up -d                              # the whole stack
docker compose exec app npm test                  # unit tests (no DB)
docker compose exec app npm run test:isolation    # cross-tenant tests (needs the DB)
docker compose exec app npx tsc --noEmit          # typecheck
docker compose exec app npm run db:generate       # after editing schema.ts
```

## Roadmap

RAG knowledge base (pgvector + heading-aware chunking + recall@k eval) → eval harness
(golden set + judge via the `judge` alias) → widget embed for mugshotmnl.com.

Two RAG decisions are already recorded in `src/db/schema.ts`: `tenantId` goes directly on
`kb_chunks` (retrieval is a leaf scan with no join to filter on), and there is **no ANN index at
first**, because pgvector post-filters and would silently under-return for small tenants.
