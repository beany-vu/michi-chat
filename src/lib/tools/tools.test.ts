// The rule these protect: a tenant only ever runs packs it has enabled, and a failing
// tool becomes a JSON error handed to the model rather than a broken turn.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTenantTools } from ".";

test("only enabled packs are offered to the model", () => {
  const tools = buildTenantTools({
    get_menu: { enabled: true, baseUrl: "https://example.com" },
    get_weather: { enabled: false, baseUrl: "https://example.com" },
  });
  // ChatCompletionTool is a union (function | custom); every pack defines a function tool.
  const names = tools.definitions.map((d) => (d.type === "function" ? d.function.name : d.type));
  assert.deepEqual(names, ["get_menu"]);
});

test("a disabled pack is not executed even if the model asks for it by name", async () => {
  const tools = buildTenantTools({
    get_weather: { enabled: false, baseUrl: "https://example.com" },
  });
  const result = JSON.parse(await tools.execute("get_weather", "{}"));
  assert.match(result.error, /Unknown tool/);
});

test("an unknown tool name is refused rather than thrown", async () => {
  const tools = buildTenantTools({ get_menu: { enabled: true, baseUrl: "https://example.com" } });
  const result = JSON.parse(await tools.execute("rm_rf_slash", "{}"));
  assert.match(result.error, /Unknown tool/);
});

test("an unreachable upstream comes back as JSON for the model, not an exception", async () => {
  const tools = buildTenantTools({
    get_menu: { enabled: true, baseUrl: "https://this-host-does-not-exist.invalid" },
  });
  const result = JSON.parse(await tools.execute("get_menu", "{}"));
  assert.ok(result.error, "expected an error payload the model can apologize with");
});

test("labels come from the pack, with the raw name as the fallback", () => {
  const tools = buildTenantTools({ get_menu: { enabled: true, baseUrl: "https://example.com" } });
  assert.equal(tools.labelFor("get_menu"), "Checking the menu");
  assert.equal(tools.labelFor("mystery"), "mystery");
});
