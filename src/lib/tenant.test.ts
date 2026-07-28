// Origin normalization is small but load-bearing: it is compared with === against the
// per-tenant allowlist, so every bug here is either a false reject or an open reflector.

import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOrigin } from "./tenant";

test("normalizes case, trailing slash and paths away", () => {
  assert.equal(normalizeOrigin("https://Example.com/"), "https://example.com");
  assert.equal(normalizeOrigin("  https://example.com/some/path "), "https://example.com");
  assert.equal(normalizeOrigin("https://example.com:8443"), "https://example.com:8443");
});

test("rejects anything that is not an http(s) origin", () => {
  // "null" is sent by sandboxed iframes and some redirects, and is trivially obtainable,
  // so it must never match an allowlist entry.
  assert.equal(normalizeOrigin("null"), null);
  assert.equal(normalizeOrigin(""), null);
  assert.equal(normalizeOrigin("file:///etc/passwd"), null);
  assert.equal(normalizeOrigin("javascript:alert(1)"), null);
  assert.equal(normalizeOrigin("data:text/html,x"), null);
});

test("a lookalike host does not normalize to the real one", () => {
  // The classic allowlist bug is endsWith/includes matching. Exact comparison of these
  // two strings is what makes that impossible.
  assert.notEqual(
    normalizeOrigin("https://mugshotmnl.com.evil.test"),
    normalizeOrigin("https://mugshotmnl.com"),
  );
  assert.notEqual(
    normalizeOrigin("https://evil.test?x=https://mugshotmnl.com"),
    normalizeOrigin("https://mugshotmnl.com"),
  );
});
