# Changelog

All notable changes to michi-chat. Dates are the release/tag date.
This project is versioned by git tags (`v*`), which trigger the GHCR image build.

## v0.2.2 — 2026-08-30

Safety hardening, driven by real production transcripts (67 visitor messages audited).

### Added

- **Owner protection-rules field.** A per-tenant "Protection rules" box in plain words
  (e.g. "never quote rental prices", "no stories"), stored as a second delimited rules
  block that can only tighten behaviour, never loosen the platform rules.
- **Model-free canned refusal.** Detected injection bait returns a fixed decline in ~1s
  without calling the model at all, so there is nothing to talk around. The English
  patterns are a cheap first filter; the multilingual model is the real backstop.
- **Language mirroring.** The bot replies in the visitor's language (English, Filipino,
  Taglish, or any other), verified live.

### Changed

- **No answering from memory.** Menu, food, drink and product questions are answered only
  from live tool results; the bot says an item is "not on the current list" instead of
  inventing one. (Fixes visitor reports of a wrong menu.)
- **No off-topic generation.** Stories, poems, essays and role-play are declined.
- **No architecture disclosure.** The bot never discusses its own wiring, tools, data
  sources, models or hosting, even to a self-claimed owner or developer.
- **No internal codename.** The assistant identifies as "the <business> assistant", never
  by any internal name. New tenants inherit this by default.
- **Per-tenant timezone.** The daily cap resets at the tenant's local midnight, and
  analytics day/busy-hours buckets are drawn in the tenant's zone.

## v0.2.0 — 2026-08-30

The admin grew up, and the platform went public.

### Added

- **Owner/staff roles** with an append-only **audit trail** of every sign-in and mutation.
- **Per-tenant analytics**: message volume, tool mix, the literal knowledge-base queries
  visitors triggered, busy hours, origins, and country (via Cloudflare, never IPs).
- **Semantic answer cache**: near-identical opening questions are served instantly at zero
  token cost, invalidated on any knowledge or settings change.
- **Answers eval** (`eval:answers`): real chat turns graded by a separate judge model for
  faithfulness and completeness.
- **Whole-tenant export/import**: move a configured tenant (settings + knowledge) between
  instances as one JSON file, with a diff preview and confirm-to-overwrite.
- **Knowledge-base CSV** export/import for bulk editing in a spreadsheet.
- **Tenant transfer + KB re-embedding** on import, so transfers cross embedding models.
- **Widget theming** (accent, logo, light/dark), a **visitor notice** field, and a
  suggestion carousel.
- **Bait circuit breaker**, **privacy mode** (store nothing), and a **generic fetch_json**
  tool pack so new tenants with their own API need no code.
- **Published Docker image** on GHCR, a three-file quickstart, and a documentation site.

## v0.1.0 — 2026-08-29

First public release: multi-tenant chat platform with a hand-rolled tool loop, RAG
knowledge base (pgvector, recall@k eval), per-tenant persona/branding/tools, embed-key
plus origin scoping, and the admin operator UI.
