# Model backends

The app never names a real model. It asks LiteLLM for three **aliases**:

| Alias | Used for |
| --- | --- |
| `michi` | Chat turns (the bot itself) |
| `judge` | Grading eval answers (kept different from `michi` on purpose) |
| `embed` | Knowledge-base embeddings |

What actually serves each alias is decided in `litellm.config.yaml`. Swapping providers is an edit there — never a code change.

## Path A: local Ollama (default)

On the machine running Docker:

```bash
ollama pull qwen3.5:4b        # michi
ollama pull qwen2.5:7b        # judge
ollama pull nomic-embed-text  # embed
```

The default config reaches Ollama at `host.docker.internal:11434`, which works on Docker Desktop and (via the compose file's `extra_hosts`) on plain Linux. If Ollama lives elsewhere, set `OLLAMA_API_BASE` in `.env`.

## Path B: a hosted provider

Put your key in `.env` (the compose file passes `OPENAI_API_KEY` and `DASHSCOPE_API_KEY` through), then repoint an alias in `litellm.config.yaml`:

```yaml
- model_name: michi
  litellm_params:
    model: openai/gpt-4o-mini
    api_key: os.environ/OPENAI_API_KEY
```

Restart the litellm container after editing:

```bash
docker compose up -d --force-recreate litellm
```

## Trying a different model on one tenant

Add a trial alias in the yaml (say, `gemma` → `ollama_chat/gemma3:4b`, or the bundled
`michi-mini` → `gemma3:1b` economy tier), restart the litellm container, and set one tenant's
**Model alias** field to it in the admin UI. That tenant now runs the new model while every
other tenant is untouched — A/B testing as configuration. The alias in use is shown to
visitors in the chat footer ("AI model: …").

![A test tenant answering through a trial alias](/screenshots/gemma-testcafe.png)

Smaller-model honesty: a ~1B model answers roughly 3x faster than a 4B one, but tool-calling
reliability degrades. Before switching a real tenant down a size, run `kb:eval` and a handful
of real tool questions against it.

## The embedding caveat

The knowledge-base column is sized to **768 dimensions** (nomic-embed-text). Changing the `embed` alias to a model with different dimensions requires a schema migration **and** re-embedding every document. Change `michi` and `judge` freely; think twice about `embed`.
