# Security model

The design assumption everywhere: the chat endpoint faces **strangers**. The embed key is public, the Origin header is forgeable off-browser, and the visitor is anonymous. Every control is chosen to hold under those conditions.

## The layers

| Control | What it stops | Holds against curl? |
| --- | --- | --- |
| Origin allowlist | Other sites embedding your bot | No — browser-enforced scoping only |
| Server-minted sessions | Client-invented identities | Yes |
| Per-session / per-IP rate limits | Bursts and floods | Partially (see proxy note) |
| Session-minting cap per tenant/day | Table-bloat via header rotation | Yes |
| **Daily message cap per tenant** | **The bill** | **Yes — this is the real backstop** |

Isolation between tenants is enforced by Postgres itself: composite foreign keys make a message that points at another tenant's conversation physically impossible, not just filtered out.

## The reverse-proxy rule

The quickstart binds to `127.0.0.1` on purpose. Anything public needs a reverse proxy (Caddy, nginx, Cloudflare Tunnel) that terminates TLS **and sets `x-real-ip`** — without a trusted proxy, the per-IP limit can be defeated by spoofing that header. The daily cap bounds the bill either way; the proxy is what makes per-IP limiting meaningful.

## Prompt injection, honestly

The prompt has three trust levels: a fixed platform preamble, the tenant persona (delimited, cannot override the preamble), and tool results (marked as third-party data, never folded into the system prompt). None of this is a hard boundary against a determined injector — the real invariant is that **nothing sensitive ever enters the model's context**: no keys, no internal hostnames, no other tenant's data. Assume the whole prompt is public, because effectively it is.

## Rules that look like limitations but aren't

- **Tenants cannot supply URLs.** A free-form URL field would let a tenant aim this server at internal services (SSRF). Tools are platform-owned code packs; the single exception, the Slack webhook, is pinned to `hooks.slack.com`.
- **The admin conversation viewer renders plain text.** The operator's browser holds the session that controls the platform; visitor-authored markdown or HTML must never execute there.
- **Admin login is rate limited** (globally, not per-IP — see the proxy note above).
