import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPreambleOnly } from "./preamble";

describe("isPreambleOnly", () => {
  it("catches an announced lookup with no answer", () => {
    assert.equal(isPreambleOnly("Let me check the Helpdesk's coverage for Austria."), true);
    assert.equal(isPreambleOnly("I'll look that up for you."), true);
    assert.equal(isPreambleOnly("One moment, searching the nomenclature."), true);
    assert.equal(isPreambleOnly("Checking our data availability for Ethiopia now."), true);
  });

  it("lets real answers through, even ones that start with let me", () => {
    assert.equal(
      isPreambleOnly(
        "Let me explain. Ethiopia is covered: tariffs (2021), regulatory requirements (2022), no step-by-step procedures. The Data availability page lists the partners.",
      ),
      false,
    );
    assert.equal(isPreambleOnly("Austria is covered: tariffs yes (2026), regulatory requirements yes (2026)."), false);
    assert.equal(isPreambleOnly(""), false);
  });

  it("ignores long texts regardless of their opening", () => {
    assert.equal(isPreambleOnly("Let me check. " + "Details follow. ".repeat(30)), false);
  });
});
