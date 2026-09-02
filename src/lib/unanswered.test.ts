// Fed with REAL punts and REAL healthy answers from the 2026-08/09 prod transcripts,
// so the patterns are tested against what the bot actually says.

import assert from "node:assert/strict";
import { test } from "node:test";
import { FRIENDLY_ERROR } from "./moderation";
import { UNANSWERED_SQL_REGEX, looksUnanswered } from "./unanswered";

const PUNTS = [
  "I'm not sure about the SCA rating for our beans. I recommend asking our baristas in store!",
  "Our beans are 100% Arabica, but the menu doesn't list a specific single origin.",
  "I'm not sure, our current specials and menu don't list any discounts.",
  "I don't have that info. The site only mentions his hobbies.",
  "I checked the events list, and there are no workshops scheduled for September right now.",
  "Honestly, I can't give you a rating on that.",
  "I'm not sure who owns the cafe, and that's not something I can confirm.",
  FRIENDLY_ERROR,
];

const HEALTHY = [
  "We're open daily 10am to 10pm at Greenwoods Executive Village!",
  "I can only help with questions about the business, like the menu, hours, or events.",
  "I can't share owner or private business information.", // scope refusal, not a gap
  "Prices aren't published online, but artisan coffee starts from P99.",
  "I don't run commands like that, so that message may have been a typo.",
  "Yes! We sell Mugshot Artisan Coffee Beans, our one house retail bean.",
];

test("real punts from prod transcripts are detected", () => {
  for (const content of PUNTS) assert.equal(looksUnanswered(content), true, content);
});

test("healthy answers and scope refusals are not gaps", () => {
  for (const content of HEALTHY) assert.equal(looksUnanswered(content), false, content);
});

test("the SQL regex agrees with the JS patterns on every sample", () => {
  const sql = new RegExp(UNANSWERED_SQL_REGEX, "i");
  for (const content of PUNTS.filter((c) => c !== FRIENDLY_ERROR)) {
    assert.equal(sql.test(content), true, `sql should match: ${content}`);
  }
  for (const content of HEALTHY) {
    assert.equal(sql.test(content), false, `sql should not match: ${content}`);
  }
});
