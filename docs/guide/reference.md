# Environment reference

## Quickstart `.env` (compose-level)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MICHI_ADMIN_PASSWORD` | yes | — | Operator login at `/admin` |
| `MICHI_CHAT_LITELLM_KEY` | yes | — | Shared app ↔ LiteLLM key; any long random string |
| `MICHI_DB_PASSWORD` | yes | — | Postgres password (internal to the compose network) |
| `MICHI_PORT` | no | `3001` | Host port for the app |
| `OLLAMA_API_BASE` | no | `http://host.docker.internal:11434` | Where LiteLLM finds Ollama |
| `OPENAI_API_KEY` / `DASHSCOPE_API_KEY` | no | — | Hosted-provider keys, referenced from `litellm.config.yaml` |
| `MICHI_IMAGE` | no | `ghcr.io/beany-vu/michi-chat:latest` | Run a locally built image instead |

## App-level variables (set by the compose file)

You only touch these when deploying without the provided compose file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | Postgres DSN; the container refuses to guess |
| `LITELLM_BASE_URL` | `http://localhost:4000/v1` | The proxy endpoint |
| `LITELLM_API_KEY` | `sk-michi-dev` | Key presented to the proxy |
| `ADMIN_PASSWORD` | — (login impossible if unset) | Operator password |
| `CHAT_MODEL` | `michi` | Default chat alias (a tenant's model override wins) |
| `EMBED_MODEL` | `embed` | Embedding alias |
| `DEFAULT_TENANT_SLUG` | `mugshot` | Which tenant `/` redirects to |

## Ports

| Port | Service | Exposed |
| --- | --- | --- |
| 3001 (host) → 3000 | app | localhost only |
| 4000 | LiteLLM | not published in the quickstart |
| 5432 | Postgres | not published in the quickstart |
