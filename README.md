# michi-chat

Chat assistant for Mugshot Artisan Cafe. Next.js + OpenAI SDK, with LiteLLM routing to any model
provider (Ollama in dev) and Postgres (pgvector) for conversations and, soon, the knowledge base.

## Run

```bash
cp .env.example .env      # set MICHI_OLLAMA_HOST to this machine's WSL eth0 IP
docker compose up -d      # app :3001 · LiteLLM :4000 · Postgres :5435
```

Chat at http://localhost:3001. Requires Ollama running locally with `qwen3.5:4b` pulled.

## How a turn works

```
browser ──POST /api/chat──▶ Next.js route ──OpenAI SDK──▶ LiteLLM ──▶ Ollama (or any provider)
   ◀── SSE: status → tool (live) → delta → done          tools ──▶ mugshotmnl.com public APIs
```

The tool loop is hand-rolled and readable (`src/app/api/chat/route.ts`): the model is offered
tool definitions, whatever it calls is executed and fed back, and the first plain-text response
streams to the browser. Conversations persist in Postgres; memory is rebuilt from the last 12
turns each request.
