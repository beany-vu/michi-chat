import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, toCsv } from "./csv";

test("round-trips markdown with commas, quotes and newlines", () => {
  const rows = [
    ["title", "content"],
    ["Hours & location", "# Hours\n\nOpen daily, 10am - 10pm.\nSay \"hi\" at the counter."],
    ["FAQ", "## Do you deliver?\n\nYes, via FoodPanda."],
  ];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test("parses excel-style CRLF and skips blank lines", () => {
  const parsed = parseCsv('a,b\r\n\r\n"x,1","y\r\nz"\r\n');
  assert.deepEqual(parsed, [
    ["a", "b"],
    ["x,1", "y\r\nz"],
  ]);
});
