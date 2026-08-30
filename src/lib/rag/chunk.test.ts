import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkMarkdown, MAX_CHUNK_CHARS } from "./chunk";

test("splits on headings and carries the breadcrumb path", () => {
  const chunks = chunkMarkdown(
    [
      "Intro paragraph that is long enough to stand on its own as a chunk of text here.",
      "## Menu",
      "The menu section body, also long enough to stand alone as its own chunk of text.",
      "### Espresso drinks",
      "Flat whites and cortados and long blacks, described at comfortable length here.",
    ].join("\n"),
    "Doc",
  );
  assert.deepEqual(
    chunks.map((c) => c.heading),
    ["Doc", "Doc > Menu", "Doc > Menu > Espresso drinks"],
  );
});

test("an H1 equal to the document title does not duplicate in the breadcrumb", () => {
  const chunks = chunkMarkdown(
    "# Hours\n\nWe are open Tuesday to Sunday, eight in the morning until eight at night.",
    "Hours",
  );
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].heading, "Hours");
});

test("oversized sections split on paragraph boundaries under the cap", () => {
  const paragraph = "word ".repeat(60).trim(); // ~300 chars
  const markdown = `## Big\n\n${Array(12).fill(paragraph).join("\n\n")}`;
  const chunks = chunkMarkdown(markdown, "Doc");
  assert.ok(chunks.length > 1, "should split");
  for (const chunk of chunks) {
    assert.ok(chunk.content.length <= MAX_CHUNK_CHARS);
    assert.equal(chunk.heading, "Doc > Big");
  }
});

test("headings inside code fences are not treated as headings", () => {
  const chunks = chunkMarkdown(
    "Some prose before the fence, long enough that it will not be merged forward.\n\n```\n# not a heading\n```",
    "Doc",
  );
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].content.includes("# not a heading"));
});

test("a too-short section merges into the next one, keeping its heading visible", () => {
  const chunks = chunkMarkdown(
    [
      "## Wifi",
      "Yes.",
      "## Pets",
      "Dogs are welcome on the terrace as long as they stay leashed and off the chairs.",
    ].join("\n"),
    "FAQ",
  );
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].content.includes("FAQ > Wifi: Yes."));
});

test("empty or heading-only documents produce no chunks", () => {
  assert.deepEqual(chunkMarkdown("", "Doc"), []);
  assert.deepEqual(chunkMarkdown("## A\n## B", "Doc"), []);
});
