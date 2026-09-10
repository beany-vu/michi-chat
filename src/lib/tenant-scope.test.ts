import assert from "node:assert/strict";
import { test } from "node:test";
import { canSeeTenant, scopeKind, visibleTenants } from "./tenant-scope";

const owner = { role: "owner" as const, tenantIds: null };
const unassigned = { role: "staff" as const, tenantIds: [] };
const cafeOnly = { role: "staff" as const, tenantIds: ["t-cafe"] };
const rows = [
  { id: "t-cafe", name: "Example Cafe" },
  { id: "t-studio", name: "Example Studio" },
];

test("owners are unscoped", () => {
  assert.equal(scopeKind(owner), "all");
  assert.ok(canSeeTenant(owner, "anything"));
  assert.deepEqual(visibleTenants(owner, rows), rows);
});

test("a staff account with no tenants sees nothing", () => {
  assert.equal(scopeKind(unassigned), "none");
  assert.equal(canSeeTenant(unassigned, "t-cafe"), false);
  assert.deepEqual(visibleTenants(unassigned, rows), []);
});

test("assigned staff see exactly their tenants", () => {
  assert.equal(scopeKind(cafeOnly), "some");
  assert.ok(canSeeTenant(cafeOnly, "t-cafe"));
  assert.equal(canSeeTenant(cafeOnly, "t-studio"), false);
  assert.deepEqual(visibleTenants(cafeOnly, rows), [rows[0]]);
});
