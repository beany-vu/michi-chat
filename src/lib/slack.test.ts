// The webhook validator is the one thing standing between "tenants get Slack
// notifications" and "tenants get an SSRF primitive". Every rejection here is an attack
// that has worked somewhere.

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSlackWebhookUrl } from "./slack";

// Deliberately NOT shaped like a real webhook token (short segments): GitHub push
// protection pattern-matches Slack webhooks and blocks pushes containing realistic ones,
// fake or not. The validator only checks host and path prefix, so the test loses nothing.
const GOOD = "https://hooks.slack.com/services/T000/B000/PLACEHOLDER";

test("accepts a canonical webhook and normalizes it", () => {
  assert.equal(validateSlackWebhookUrl(`  ${GOOD}  `), GOOD);
  // Query strings and fragments are dropped, not echoed.
  assert.equal(validateSlackWebhookUrl(`${GOOD}?a=b#c`), GOOD);
  // Host case is normalized by URL parsing.
  assert.equal(validateSlackWebhookUrl(GOOD.replace("hooks.slack", "HOOKS.SLACK")), GOOD);
});

test("rejects everything that is not exactly hooks.slack.com over https", () => {
  const bad = [
    "not a url",
    "http://hooks.slack.com/services/T/B/X", // plain http
    "https://hooks.slack.com:8443/services/T/B/X", // explicit port
    "https://evil.com/services/T/B/X", // wrong host
    "https://hooks.slack.com.evil.com/services/T/B/X", // suffix trick
    "https://evilhooks.slack.com/services/T/B/X", // subdomain of slack.com, still wrong host
    "https://hooks.slack.com/api/anything", // wrong path
    "https://user:pass@hooks.slack.com/services/T/B/X", // credentials
    "https://192.0.2.1/services/T/B/X", // a raw IP (TEST-NET-1), the class of actual target
    "file:///etc/passwd",
  ];
  for (const url of bad) {
    assert.throws(() => validateSlackWebhookUrl(url), new RegExp("Slack webhook"), url);
  }
});
