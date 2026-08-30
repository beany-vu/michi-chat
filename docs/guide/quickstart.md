# Quickstart

You need Docker and about five minutes. No clone, no Node toolchain, no account anywhere:
the image is public at `ghcr.io/beany-vu/michi-chat`.

## 1. Get the three files

Download the contents of [`examples/quickstart/`](https://github.com/beany-vu/michi-chat/tree/master/examples/quickstart) into an empty directory:

- `docker-compose.yml` — the app image, LiteLLM, and Postgres (pgvector)
- `.env.example` — the settings template
- `litellm.config.yaml` — which real models serve the app's model aliases

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` and set the three required values (the stack refuses to start without them):

| Variable | What it is |
| --- | --- |
| `MICHI_ADMIN_PASSWORD` | Login for the operator UI at `/admin` |
| `MICHI_CHAT_LITELLM_KEY` | Any long random string; shared between app and proxy |
| `MICHI_DB_PASSWORD` | Any random string; the database is not exposed outside Docker |

Then pick a model backend — local Ollama works out of the box if you pull three models; a hosted provider is a small yaml edit. See [Model backends](./models).

## 3. Run

```bash
docker compose up -d
```

Migrations run automatically on first boot. Then:

- **<http://localhost:3001>** — the seeded **demo tenant** (Mugshot Artisan Cafe, sample data), so you can try the chat immediately
- **<http://localhost:3001/admin>** — the operator UI: create your own tenant, write its persona, enable tools, add knowledge

The demo tenant is just that — a demo. Your real bot is a new tenant you create in the admin UI.

## Where things run

| Service | Image | Notes |
| --- | --- | --- |
| app | `ghcr.io/beany-vu/michi-chat` | Next.js UI + API, migrations on boot |
| litellm | pinned by digest | One OpenAI-compatible door to any provider |
| db | `pgvector/pgvector:pg17` | Required: a migration enables the vector extension |

Everything binds to `127.0.0.1` only. For anything public-facing, put a reverse proxy in front — see [Security model](./security).
