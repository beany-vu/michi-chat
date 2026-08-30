// The allowlist is the safety property: whatever the upstream returns, only named
// fields survive, and arrays are capped.

import assert from "node:assert/strict";
import { test } from "node:test";
import { projectFields } from "./generic";

test("objects keep only allowlisted fields", () => {
  assert.deepEqual(
    projectFields({ name: "Latte", price: 120, secretCost: 40 }, ["name", "price"]),
    { name: "Latte", price: 120 },
  );
});

test("arrays are projected per item and capped", () => {
  const big = Array.from({ length: 500 }, (_, i) => ({ id: i, keep: "yes", drop: "no" }));
  const out = projectFields(big, ["keep"]) as unknown[];
  assert.equal(out.length, 50);
  assert.deepEqual(out[0], { keep: "yes" });
});

test("scalars pass through unchanged", () => {
  assert.equal(projectFields("plain", ["x"]), "plain");
});
