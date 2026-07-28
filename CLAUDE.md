# michi-chat

Mugshot Artisan Cafe's chat assistant: Next.js (App Router) + OpenAI SDK + LiteLLM proxy +
Drizzle/Postgres (pgvector image, RAG-ready). The deliberate SIMPLE rebuild of
`~/projects/michi-chatbot` (.NET) — single tenant, one language, no auth platform. The .NET repo
stays as reference and portfolio; its learning docs live in `~/projects/ai-docs/michi-chatbot/`
and the concepts (tools, RAG, evals, guardrails) carry over 1:1.

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

## Layout

- `src/app/api/chat/route.ts` — SSE chat turn: hand-rolled tool loop (status/tool/delta/done)
- `src/lib/tools.ts` — tool definitions + executors (mugshot public APIs) + persona
- `src/db/schema.ts` — conversations + messages (Drizzle; `npm run db:push` syncs)
- `src/components/ChatPanel.tsx` — the chat UI
- `litellm/config.yaml` — model aliases → real providers

## Roadmap (borrowed from the .NET project's plan, simplified)

RAG knowledge base (pgvector + heading-aware chunking + recall@k eval) → eval harness
(golden set + judge via the `judge` alias) → widget embed for mugshotmnl.com.
