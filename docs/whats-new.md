# What's new

The headline changes, newest first. The full list lives in
[CHANGELOG.md](https://github.com/beany-vu/michi-chat/blob/master/CHANGELOG.md).

## v0.2.3 — Next.js 16

Upgraded the framework to Next.js 16, which clears the outstanding security advisories.
No change to how the bot behaves.

## v0.2.2 — safety hardening

Shaped by real questions people asked the live bot on launch day.

- **Protection rules per tenant.** A plain-words box on the tenant form for hard
  boundaries ("never quote rental prices", "no stories"). It can only tighten the bot,
  never loosen the platform rules. See [The admin UI](./guide/admin).
- **Answers only from real data.** The bot no longer names menu items from memory; if the
  live menu does not list something, it says so. No invented dishes.
- **No off-topic writing.** Stories, poems and role-play are declined.
- **Stays private about itself.** It won't discuss its tools, data sources, models or
  hosting, even to someone claiming to be the owner.
- **Speaks the visitor's language.** English, Filipino, Taglish, and more, matched
  automatically.
- **Instant refusal of obvious attacks**, with no model call, plus a multilingual model
  backstop for the rest.

## v0.2.0 — the platform grew up

- **Roles and an audit trail.** Owner and staff logins; every change is recorded. See
  [Running it day to day](./owner/day-to-day).
- **Analytics per tenant.** What visitors ask, which tools they reach for, busy hours,
  and where they come from.
- **Move a whole tenant as one file.** Export settings and knowledge, import elsewhere.
- **Instant repeat answers.** Common questions are cached and served at zero cost.
- **Graded answer quality.** A second model checks the bot's answers for faithfulness.
- **Branding**: your logo, accent colour, light/dark, and a visitor notice.

## v0.1.0 — first release

The multi-tenant assistant: per-business persona, tools and knowledge base, an embeddable
widget, and the operator admin.
