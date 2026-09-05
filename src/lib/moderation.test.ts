import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeProviderError, FRIENDLY_ERROR, friendlyError } from "./moderation";

test("flags upstream error payloads and moderation blocks", () => {
  for (const t of [
    '{"error":{"message":"data:1 input is flagged as unsafe by content moderation warnings"}}',
    "data:1 input is flagged as unsafe by content moderation warnings",
    "litellm.UnsupportedParamsError: ...",
  ]) assert.equal(looksLikeProviderError(t), true, t);
});

test("does not flag real answers", () => {
  for (const t of [
    "We're open daily 10am to 10pm!",
    "Yes, we have free wifi. Ask staff for the password.",
    "I'm not sure about that, please ask our staff.",
  ]) assert.equal(looksLikeProviderError(t), false, t);
});

test("the friendly error is worded for the tenant kind", () => {
  assert.equal(friendlyError("business"), FRIENDLY_ERROR);
  assert.ok(FRIENDLY_ERROR.includes("counter"));
  assert.ok(!friendlyError("coach").includes("counter"));
  assert.ok(!friendlyError("coach").includes("staff"));
  assert.ok(friendlyError("coach").length > 20);
});
