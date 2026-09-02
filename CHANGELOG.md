# Changelog

All notable changes to michi-chat. Dates are the release/tag date.
This project is versioned by git tags (`v*`), which trigger the GHCR image build.

## v0.2.17 - 2026-09-02

### Changed

- **Admin navigation redesigned.** The rail keeps the paper-and-ink language but drops
  the uppercase tracking for normal-case labels with hairline stroke icons, an oak dot
  wordmark, and a clearer active state (oak icon + inset bar; underline on the mobile
  strip).

### Added

- **PDF-to-KB guidance.** The knowledge-base page now explains how to move facts out of
  a PDF/Word file: copy the text, paste as a document, tidy into short `##` sections,
  drop layout leftovers. (The bot only reads the text stored here.)

## v0.2.16 - 2026-09-02

### Added

- **Every assistant turn explains itself.** Transcript turns carry a labeled pill for
  which path produced the answer - `cached`, `guardrail`, `used tools: <names>`, or
  `model only` - with a hover tooltip teaching what that case means and why it shows (or
  hides) tokens and the debug block. A one-line legend sits at the top of the page.

## v0.2.15 - 2026-09-02

### Added

- **Flagged conversations.** Conversations get a moderation marker: a 🚩 column on the
  admin list (reason on hover) and a Flag/Unflag button on the transcript page (staff
  can flag too). The probe breaker flags automatically (`auto: prompt-injection bait`,
  `auto: command probe`); manual flags record `manual`.
- **Slash-command probes get a deterministic brush-off.** A message that is just a
  command (`/context`, `/reset`) never reaches the model: a fixed "I don't run commands,
  maybe a typo?" line comes back, and the conversation is flagged.
- **Opt-in GA4 analytics on visitor pages.** Set `GA_MEASUREMENT_ID` (env, runtime,
  server-injected - deliberately not `NEXT_PUBLIC_*` because the image is prebuilt).
  Tenants separate by `page_path` (`/t/<slug>`) and a `tenant` event param. Admin pages
  stay untracked.

### Changed

- **Bait turns are stored now.** The bait breaker used to refuse without writing any
  rows, which made baiting invisible in the admin. Detected turns (and the canned
  refusal) now land in the transcript and auto-flag the conversation; the 3-strikes/hour
  cut-off is unchanged.
- **Prompt hardening from live transcripts.** Off-topic requests get ONE short decline
  sentence (no partial answers, no padded advice); platform/admin/password/account-
  recovery help is refused in one sentence however urgent it sounds; slash commands are
  never treated as commands and never answered with a capability list.

## v0.2.14 - 2026-08-31

### Added

- **"cached" badge in transcripts.** Assistant turns served from the semantic answer
  cache are labeled, explaining why they carry no tool debug block (no model ran, no
  tools were called). Detected by their stored 0->0 token signature.

## v0.2.13 - 2026-08-31

### Changed

- **Readable tool debugging in transcripts.** The "debug: tool calls & results" expander
  shows each call as its own block with pretty-printed arguments and result JSON, instead
  of one escaped line. Still plain text.

## v0.2.12 - 2026-08-31

### Changed

- **Admin timestamps show in the operator's own timezone.** Dates across the admin
  (conversations, transcripts, keys, accounts, activity, KB) now render browser-local via
  a client component; before they showed the server's UTC clock. Analytics day/busy-hour
  buckets intentionally stay in the tenant's timezone.
- **Transcripts read like a chat.** Visitor messages are accent-tinted bubbles on the
  right, assistant replies on the left, the same sides as the widget - instead of a flat
  stack of blocks. Content stays plain text (never markdown/HTML in the admin).

## v0.2.11 - 2026-08-31

### Fixed

- **Weather answers no longer quote the heat index as the temperature.** The tool output
  uses self-describing field names (airTemperatureC / heatIndexFeelsLikeC) plus a usage
  note, after a visitor compared the bot to a weather app and saw a 10 degree gap.

## v0.2.10 - 2026-08-31

### Fixed

- **Events answers are date-aware.** `get_events` now splits results into upcoming and
  recent past around "today" in the tenant's timezone; before, it blindly served the ten
  oldest events from the API, so "what's coming up" answered with long-past events.
- **Admin usable on phones.** Tables scroll inside themselves instead of forcing the whole
  page wide, and paddings scale down through CSS variables. Every admin page now fits a
  phone viewport with no horizontal page scroll.

### Changed

- **One-line footer credit.** The model alias is no longer shown in the chat footer, so
  the credit fits one line on phones ("AI answers can contain mistakes" stays).
- **KB: contact channels.** The Mugshot knowledge base now prefers the inquiry form and
  email over the phone line, which is not staffed around the clock.

## v0.2.9 - 2026-08-30

### Added

- **Country column** on the admin conversations list (country-level only, from the network
  edge; visitor IPs are never stored).
- **Retention note** on the conversations list: conversations are kept only to improve the
  service, and transcripts with sensitive information can be deleted.

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
