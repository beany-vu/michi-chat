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
- **Commit convention: `type - scope: summary`** (scope optional: `type: summary`). Types:
  feature, fix, docs, refactor, test, build, ci, chore. Summary imperative, lowercase,
  ≤60 chars. Body only when the why is not obvious, wrapped at 72.
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
  free-form URL field would be an SSRF hole. **One carve-out:** the per-tenant Slack webhook,
  allowed only because `validateSlackWebhookUrl()` pins it to exactly
  `https://hooks.slack.com/services/…` (no other host, no port, no redirect following) — a URL
  that can only ever be hooks.slack.com cannot be aimed at Ollama or the DB.
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
- `src/lib/tools/` — pack registry, the mugshot packs, the `search_kb` pack, and `index.ts`
  which turns a tenant's `toolConfig` into definitions + labels + one executor
- `src/lib/rag/` — heading-aware chunker, embeddings (LiteLLM alias `embed`, 768 dims),
  ingestion + the tenant-scoped leaf-scan retrieval
- `src/lib/slack.ts` — webhook validator (the SSRF pin) + fire-and-forget notifier
- `src/db/schema.ts` — tenants, api_keys, widget_sessions, conversations, messages,
  admin_sessions, kb_documents, kb_chunks
- `kb/<slug>/` — markdown source docs per tenant; `eval/kb-golden.json` — the recall golden set
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
docker compose exec app npm run kb:ingest -- mugshot   # (re)embed kb/mugshot/*.md
docker compose exec app npm run kb:eval -- mugshot     # recall@k over eval/kb-golden.json
docker build -t michi-chat:local .                     # the publishable image (standalone + migrate-on-boot)
```

## Distribution

The publishable image is built by `Dockerfile` (Next standalone; `docker/entrypoint.mjs` runs
migrations via drizzle-orm's programmatic migrator, then starts the server) and published to
GHCR by `.github/workflows/docker-publish.yml` on `v*` tags. Outsiders run it via the three
files in `examples/quickstart/` — that compose pins LiteLLM by digest and requires passwords
instead of dev defaults. GHCR packages start private: flip to public once after the first
publish. The image is `ghcr.io/beany-vu/michi-chat`; the workflow runs on a self-hosted runner,
which must be registered on the repo before pushing a tag.

## Roadmap

~~RAG knowledge base~~ (done: pgvector + heading-aware chunking + recall@k eval; the two schema
decisions — tenantId directly on `kb_chunks`, no ANN index at first — are explained in
`src/db/schema.ts`) → eval harness for ANSWERS (golden set + judge via the `judge` alias; the
recall eval only grades retrieval) → widget embed for mugshotmnl.com.

The kb/mugshot docs carry REAL facts harvested from mugshotmnl.com's live APIs on 2026-08-30
(hours, address, contacts, beans, events, venue-rental channels, the from-₱99 price line);
verify with the owner before launch, and prefer live tools over KB for anything that changes
(events and specials already are).
Editing config.yaml needs `docker compose up -d --force-recreate litellm` (plain restart dies on
the stale single-file bind mount under Docker Desktop/WSL).
