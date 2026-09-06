import assert from "node:assert/strict";
import { test } from "node:test";
import { chatUrlTransform, remarkAutolink, segmentText } from "./autolink";

const links = (s: string) => segmentText(s).filter((x) => x.type === "link");

test("a bare https URL becomes a link, trailing punctuation stays text", () => {
  const segs = segmentText("Rates: https://mugshotmnl.com/pages/venue-rental/. See you!");
  assert.deepEqual(segs, [
    { type: "text", value: "Rates: " },
    { type: "link", value: "https://mugshotmnl.com/pages/venue-rental/", url: "https://mugshotmnl.com/pages/venue-rental/" },
    { type: "text", value: ". See you!" },
  ]);
});

test("emails become mailto links", () => {
  assert.deepEqual(links("Email mugshotcoffeeph@gmail.com or Instagram @mugshotcoffeeph."), [
    { type: "link", value: "mugshotcoffeeph@gmail.com", url: "mailto:mugshotcoffeeph@gmail.com" },
  ]);
});

test("Philippine phone formats become tel links with separators stripped", () => {
  assert.deepEqual(links("Phone +63 2 8570 3155 exists").map((l) => l.url), ["tel:+63285703155"]);
  assert.deepEqual(links("call +63285703155 now").map((l) => l.url), ["tel:+63285703155"]);
  assert.deepEqual(links("mobile 0917 123 4567").map((l) => l.url), ["tel:09171234567"]);
  assert.deepEqual(links("landline 02-8570-3155").map((l) => l.url), ["tel:0285703155"]);
});

test("prices, years, hours and cup counts never become phone links", () => {
  assert.deepEqual(links("Venue Rental is 3,500 pesos for 3 hours, extension 500 per hour."), []);
  assert.deepEqual(links("50 cups 8,000, 100 cups 14,000, 150 cups 22,000, 120 per extra cup"), []);
  assert.deepEqual(links("open 10am to 10pm, since 2026-09-06, 20 amp outlet"), []);
  assert.deepEqual(links("order 0123 456"), []);
});

test("two phone numbers in one sentence stay two links", () => {
  assert.deepEqual(links("+63 2 8570 3155 or 0917 123 4567").map((l) => l.url), [
    "tel:+63285703155",
    "tel:09171234567",
  ]);
});

test("the remark plugin rewrites text nodes but leaves existing links and code alone", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Write to hello@example.com. " },
          { type: "link", url: "https://a.example", children: [{ type: "text", value: "https://a.example" }] },
          { type: "inlineCode", value: "+63 2 8570 3155" },
        ],
      },
    ],
  };
  remarkAutolink()(tree);
  const para = tree.children[0];
  assert.deepEqual(
    para.children.map((c) => c.type),
    ["text", "link", "text", "link", "inlineCode"],
  );
  assert.equal(para.children[1].url, "mailto:hello@example.com");
  assert.equal(para.children[3].url, "https://a.example");
});

test("url transform allows http(s), mailto and tel, blanks other schemes, keeps relative", () => {
  assert.equal(chatUrlTransform("tel:+63285703155"), "tel:+63285703155");
  assert.equal(chatUrlTransform("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(chatUrlTransform("https://x.y/?q=1"), "https://x.y/?q=1");
  assert.equal(chatUrlTransform("javascript:alert(1)"), "");
  assert.equal(chatUrlTransform("data:text/html,x"), "");
  assert.equal(chatUrlTransform("/events?x=a:b"), "/events?x=a:b");
});
