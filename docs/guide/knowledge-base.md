# Knowledge base

Each tenant can have a set of markdown documents the bot searches when a visitor asks a factual question — hours, policies, FAQs, product details. Retrieval is grounded: when nothing relevant is found, the bot says it doesn't know instead of guessing.

## Adding documents

**Tenant → Knowledge base.** Paste markdown with a title, save — the document is chunked, embedded and searchable immediately. Saving under an existing title replaces that document.

Two rules make retrieval precise:

1. **Structure with headings.** Chunking is heading-aware: each `##` section becomes a retrieval unit with its breadcrumb attached. One fact per section beats one wall of text.
2. **Only counter-safe facts.** Everything here can reach a visitor. Nothing internal, no wholesale prices, nothing you would not say out loud at the counter.

## Wiring it to the bot

Enable the **`search_kb`** tool pack on the tenant page. Without it, the documents exist but the bot never reads them.

## Checking quality

The table shows a chunk count per document — one giant chunk or fifty tiny ones is a sign the headings need work. Developers with a repo clone can go further:

```bash
docker compose exec app npm run kb:ingest -- <tenant-slug>     # bulk-ingest kb/<slug>/*.md
docker compose exec app npm run kb:eval -- <tenant-slug>       # recall@k: does the right doc come back?
docker compose exec app npm run eval:answers -- <tenant-slug>  # judge-graded: is the final ANSWER right?
```

The recall eval measures retrieval; the answers eval sends real chat turns and has a second
model grade each reply for faithfulness (nothing invented) and completeness (the required
facts arrive) — numbers, not feelings.

## Backup and bulk editing (CSV)

**Export CSV** on the Knowledge base page downloads every document as a two-column
spreadsheet (title, content). Edit it in Excel or Google Sheets — fix facts, add rows —
then **Import from CSV** brings it back: rows match by title, changed documents are
re-embedded, unchanged ones are skipped. Export before big edits and you always have a
restore point.

## Instant repeat answers

Common opening questions ("what time do you open?") are served from a semantic cache: an
answer already given for a near-identical first message returns instantly, at zero model
cost. The cache clears itself whenever you save or delete knowledge or tenant settings, so
editing a fact never leaves a stale cached answer behind.
