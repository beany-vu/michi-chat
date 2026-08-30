# The admin UI

`/admin`, protected by `MICHI_ADMIN_PASSWORD`. This is the single-operator control panel: every bot on the platform is configured here, and nowhere else.

## Creating a tenant

**Admin → New tenant.** A tenant is one business: a slug (immutable, it forms the chat URL `/t/<slug>`), a name, and a starter persona. A public embed key is minted automatically — a tenant with no key cannot be visited.

## The tenant form

| Section | What it controls |
| --- | --- |
| Identity | Name, active/disabled, model alias override, **daily message cap** |
| Persona | The tenant layer of the system prompt: identity, hours, location, voice |
| Branding | Title, greeting, subtitle, composer placeholder, accent color, suggestion chips |
| Tools | Enable tool packs and fill in their parameters (see below) |
| Notifications | Optional Slack incoming webhook — new-conversation and cap-reached alerts |
| Allowed origins | Which websites may embed this bot (one origin per line) |

Three fields deserve a note:

- **Daily message cap** is the control that actually protects your bill. The embed key is public by design, so assume anyone can call the API; the cap is what bounds the damage.
- **Persona** is wrapped in delimiters below a fixed platform preamble it cannot override. Keep it to identity and voice; live facts belong in tools and the knowledge base.
- **Slack webhook** must be exactly a `https://hooks.slack.com/services/…` URL. Nothing else is accepted — that restriction is a security boundary, not a bug.

## Tools

Tools are **code packs**: the platform owns the code, a tenant enables a pack and fills in parameters (like a site base URL). Tenants never supply raw URLs. Enable `search_kb` to give the bot access to the tenant's [knowledge base](./knowledge-base).

## Keys

**Tenant → Embed keys.** Public keys ship in a customer's page source, so they're shown in full — they select a tenant, they don't authorize anything. Rotation: create a new key, deploy it, revoke the old one (revoked keys stay visible so stray traffic can be noticed).

## Conversations, usage, analytics

**Admin → Conversations** shows every transcript (rendered as plain text deliberately);
owners can export any transcript as JSON or delete it outright. **Admin → Usage** aggregates
messages, tokens and latency per tenant per day. **Tenant → Analytics** breaks down the last
30 days: volume, tool mix, the actual knowledge-base queries visitors triggered, busy hours,
origins, and (behind Cloudflare) country-level location — never IPs.

## Roles and privacy

**Accounts** (owner only) adds staff logins: conversations/usage reading plus knowledge-base
editing, nothing else. The env `ADMIN_PASSWORD` stays a break-glass owner login. Each tenant
also has a **Store conversations** switch — off means nothing is written to the database at
all, at the cost of multi-turn memory (the daily cap still applies via a separate counter).
