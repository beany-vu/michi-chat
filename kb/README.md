# Knowledge base sources

`kb/<slug>/` holds the markdown documents for a tenant. `npm run kb:ingest -- <slug>`
chunks and embeds every `*.md` in the matching folder; a document's title is its first H1.

This repo ships one tenant, `example-cafe`, and everything in it is **invented sample
data**. It exists so the two eval golden sets in `eval/` have something to grade, and so a
new contributor can run the whole pipeline without access to anyone's real content.

## What must never be committed here

- **A real tenant's knowledge base.** It describes an actual business, and this repo is
  public. Keep it in the operator's own private deploy repo.
- **Anyone's personal data**, and especially third parties who are not the operator: a
  venue's artist roster, staff details, customer information. Git history is permanent, so
  a later deletion does not undo the disclosure, and none of it can be governed by whatever
  consent the owning application enforces.
- **Anything secret**: webhook URLs, API keys, admin passwords. Those belong in `.env` on
  the server.

## What belongs in the KB at all

Only facts that do not change. Anything that moves (opening events, live specials, a
roster) belongs behind a tool, not an embedding. An embedded fact goes stale silently and
is then served with full confidence, which is worse than having no answer.
