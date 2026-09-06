import assert from "node:assert/strict";
import { test } from "node:test";
import { describeTool } from "./describe";
import { TOOL_PACKS } from "./index";

test("search_kb describes its query input and what comes back", () => {
  const d = describeTool("search_kb");
  assert.ok(d);
  assert.equal(d.label, "Checking our info");
  assert.deepEqual(
    d.inputs.map((i) => [i.name, i.required]),
    [["query", true]],
  );
  assert.match(d.inputs[0].description, /visitor's question/);
  assert.match(d.returns, /knowledge base/);
});

test("a no-argument tool lists no inputs, an unknown id is null", () => {
  assert.deepEqual(describeTool("get_weather")?.inputs, []);
  assert.equal(describeTool("rm_rf_slash"), null);
});

test("every pack states what it returns, in a sentence an owner can read", () => {
  for (const [id, pack] of Object.entries(TOOL_PACKS)) {
    assert.ok(pack.returns.length > 30, `${id} needs a real returns sentence`);
  }
});
