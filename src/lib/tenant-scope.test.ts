import assert from "node:assert/strict";
import { test } from "node:test";
import { canSeeTenant, scopeKind, visibleTenants } from "./tenant-scope";

const owner = { role: "owner" as const, tenantIds: null };
const unassigned = { role: "staff" as const, tenantIds: [] };
const mugshotOnly = { role: "staff" as const, tenantIds: ["t-mugshot"] };
const rows = [
  { id: "t-mugshot", name: "Mugshot" },
  { id: "t-beany", name: "Hoang" },
];

test("owners are unscoped", () => {
  assert.equal(scopeKind(owner), "all");
  assert.ok(canSeeTenant(owner, "anything"));
  assert.deepEqual(visibleTenants(owner, rows), rows);
});

test("a staff account with no tenants sees nothing", () => {
  assert.equal(scopeKind(unassigned), "none");
  assert.equal(canSeeTenant(unassigned, "t-mugshot"), false);
  assert.deepEqual(visibleTenants(unassigned, rows), []);
});

test("assigned staff see exactly their tenants", () => {
  assert.equal(scopeKind(mugshotOnly), "some");
  assert.ok(canSeeTenant(mugshotOnly, "t-mugshot"));
  assert.equal(canSeeTenant(mugshotOnly, "t-beany"), false);
  assert.deepEqual(visibleTenants(mugshotOnly, rows), [rows[0]]);
});
