// Pure unit tests for the PDF triage: fed plain page strings, no PDF parser involved.

import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPages, estimateTotalTokens, triagePdf, verdictFor } from "./pdf-import";

const page = (body: string, n: number) =>
  `Mugshot Artisan Cafe\n${body}\nPage ${n} of 4`;

test("repeated headers, page numbers and TOC dots are stripped for free", () => {
  const pages = [
    page("Opening hours\nDaily 10am to 10pm", 1),
    page("Location\nGreenwoods Executive Village", 2),
    page("Contents ......... 3\nPolicies\nPets welcome outside", 3),
    page("Contact\nmugshotcoffeeph@gmail.com", 4),
  ];
  const { text, removed } = cleanPages(pages);
  assert.ok(!text.includes("Mugshot Artisan Cafe\nOpening"), "header should be gone");
  assert.ok(!/Page \d of 4/.test(text));
  assert.ok(!text.includes("........."));
  assert.ok(text.includes("Daily 10am to 10pm"));
  assert.ok(text.includes("Pets welcome outside"));
  assert.equal(removed.length, 3);
});

test("a unique heading is never mistaken for a running header", () => {
  const pages = ["Opening hours\nDaily 10am to 10pm", "Location\nGreenwoods Village"];
  const { text } = cleanPages(pages);
  assert.ok(text.includes("Opening hours"));
  assert.ok(text.includes("Location"));
});

test("scanned PDFs are called out", () => {
  const triage = triagePdf(["", " ", "", "Only one real page with text on it here"]);
  assert.equal(triage.likelyScanned, true);
  assert.ok(triage.suggestions.some((s) => s.includes("scanned")));
});

test("verdict tiers match the documented thresholds", () => {
  assert.equal(verdictFor(19_999), "green");
  assert.equal(verdictFor(20_000), "yellow");
  assert.equal(verdictFor(100_000), "red");
});

test("token estimate is chars/4 times 1.6, rounded up", () => {
  assert.equal(estimateTotalTokens(4_000), 1_600);
});

test("a small clean file gets a green verdict and no nagging", () => {
  const triage = triagePdf(["## Hours\nDaily 10am to 10pm.\n\n## Parking\nFree parking."]);
  assert.equal(triage.verdict, "green");
  assert.equal(triage.suggestions.length, 0);
});
