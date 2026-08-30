# Embedding on a website

Every tenant is reachable at `/t/<slug>` — a full-page chat with the tenant's branding. Getting that chat *onto the business's own website* takes two pieces of configuration and one piece of HTML.

## 1. Allow the origin

In the tenant form, add the website to **Allowed origins**:

```
https://www.example-cafe.com
https://example-cafe.com
```

Scheme and host only, one per line, both `www` and bare variants if both exist. Requests from pages on other origins are refused.

## 2. Use the embed key

The tenant's public key (**Tenant → Embed keys**) identifies which bot to serve. It is a *selector, not a secret* — it is designed to appear in page source.

## 3. Embed

The simplest embed today is an iframe pointing at the tenant page:

```html
<iframe
  src="https://chat.your-platform.com/t/example-cafe"
  style="position: fixed; bottom: 16px; right: 16px; width: 380px; height: 560px;
         border: 0; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.25);"
  title="Chat with Example Cafe">
</iframe>
```

A floating-bubble widget script (`embed.js`) is on the roadmap; the API it needs — CORS per origin, the `x-embed-key` header, server-issued sessions — is already in place, so custom widgets can also talk to `POST /api/chat` directly today.

## What keeps this safe

- The **origin allowlist** stops other websites from embedding a bot that isn't theirs (browser-enforced scoping).
- The **daily message cap** holds even against direct API calls with `curl` — origin checks don't apply off-browser, the cap does.
- Visitor identity is a **server-minted session token**, not anything the page invents.

For a bot on the public internet, also read [Security model](./security) — especially the reverse-proxy note.
