# Changelog

All notable changes to michi-chat. Dates are the release/tag date.
This project is versioned by git tags (`v*`), which trigger the GHCR image build.

## v0.2.8 - 2026-08-30

### Changed

- **Compact visitor notice.** The notice is a small rounded box with an x to dismiss,
  freeing chat space, instead of a large text block with a Hide link.
- **Visible Send button** in every theme (a dark tenant accent no longer makes the
  disabled button vanish).
- **Embed mode** (?embed=1): the floating widget hides the chat page's own header so the
  two headers no longer stack, and the redundant Close pill is gone (the header collapse
  control is the single close).

## v0.2.7 - 2026-08-30

### Added

- **Chat entrance animations.** Messages, tool chips and suggestion chips rise and fade in
  as they appear (reduced-motion respected), so the widget feels alive instead of popping.

### Changed

- **Faster image builds.** The publish workflow builds amd64 only (arm64 was emulated and
  cost ~80% of the time) and cancels superseded builds, so releases go out in minutes.

## v0.2.6 - 2026-08-30

### Fixed

- **Faster answers.** Upstream tool calls (weather, menu, events) are cached for 60s and
  run in parallel within a round, and the fetch timeout dropped from 15s to 6s, so a slow
  cafe API no longer makes a visitor wait. Repeat suggestion-chip questions are near-instant
  via the semantic cache.
- **No invented products.** The bot lists only real menu items and the single real coffee
  bean; negative facts ("what we do not sell") let it refuse confidently.
- **Provider errors never reach the visitor.** If the model backend returns an error as
  message content (e.g. an over-eager content-moderation block), the bot now shows a
  friendly fallback and keeps the real error in the transcript for the operator, instead
  of streaming raw JSON into the chat.

### Changed

- **Upgraded to Next.js 16** (from 15). Clears the postcss and sharp security advisories
  (npm audit --omit=dev: 0 high/critical). No behaviour change; verified with a clean
  build, typecheck, 29 tests, and a live smoke test.

## v0.2.2 - 2026-08-30

Safety hardening, driven by real production transcripts (67 visitor messages audited).

### Added

- **Suggestion chips lead with revenue and brand topics** (events, workshops, venue rental)
  instead of weather.
- **Per-tenant browser tab title** shows the business name; the admin has its own title.

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

## v0.2.0 - 2026-08-30

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

## v0.1.0 - 2026-08-29

First public release: multi-tenant chat platform with a hand-rolled tool loop, RAG
knowledge base (pgvector, recall@k eval), per-tenant persona/branding/tools, embed-key
plus origin scoping, and the admin operator UI.
