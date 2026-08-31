# Contributing to michi-chat

First: you're welcome here. This project exists so that a corner cafe, a barbershop, a
climbing gym or a one-person studio can have a real AI assistant on their website without
paying a per-seat SaaS subscription — one Docker Compose stack, running on whatever
machine they already have, fully offline with local models if they want. If that mission
appeals to you, there is a place for you in this repo whether you write code or not.

## Why this is a nice codebase to contribute to

- **You can actually read it.** The whole platform is deliberately small — one afternoon
  gets you the full picture, and [LEARNING.md](LEARNING.md) is a guided tour written for
  exactly that. Provider routing lives in LiteLLM config, not code, which is why the app
  stays small.
- **Everything runs on your machine.** `docker compose up -d`, no cloud account, no API
  key needed — the default backend is local Ollama. `npm test` finishes in seconds.
- **A new capability is one file.** Tools are plugins: implement the `ToolPack` interface
  in `src/lib/tools/`, register it in `registry.ts`, done. See the
  [extending guide](https://beany-vu.github.io/michi-chat/guide/extending).

## Contributions we'd love

**No code required:**

- Run it for a real (or imagined) small business and report what confused you — fresh
  eyes on the admin UI and the owner docs are worth more than features.
- Knowledge-base starter templates for business types: cafe, salon, gym, guesthouse,
  repair shop… (what documents, what tone, what visitors actually ask).
- Docs improvements, especially the non-technical owner guides — and translations of
  them, since small-shop owners everywhere are the audience.

**Code, small and self-contained:**

- A new tool pack: bookings, menu of the day, loyalty stamps, order status, gift cards —
  one file each, and every one makes the platform useful to a new kind of shop.
- Eval cases for the `judge` harness (`eval/`): real questions visitors ask, with what a
  good answer must contain. These keep everyone else's changes honest.
- Provider recipes: a tested `litellm.config.yaml` block for a provider you use (Groq,
  Mistral, DashScope, OpenRouter…), with its quirks documented.

**Bigger ideas** (multi-language chat, new channels like WhatsApp/Messenger, human
handoff): open an issue first so we can agree on a direction before you invest time.

## The mechanics

1. Fork, then `docker compose up -d` (see the
   [quickstart](https://beany-vu.github.io/michi-chat/guide/quickstart)) — the seeded
   demo tenant means it works before you touch anything.
2. Make your change. Match the style around you; plain TypeScript, no cleverness.
3. `npm test` and `npm run typecheck` must pass. If you added behavior, add a test —
   the existing `*.test.ts` files show the pattern (plain `node:test` via tsx).
4. Open a PR that explains *why*, not just what. Small PRs merge fast; a one-file tool
   pack with a test is the ideal shape.

Not sure whether something is wanted? Open an issue and ask — an issue that says "would
you take a PR for X?" always gets an answer, and there's no such thing as a question too
small. Be kind in discussions; assume good intent; remember the audience is small-shop
owners who are trusting us with their customers' first impression.
