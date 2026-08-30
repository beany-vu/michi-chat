// The generic pack the registry's design note always planned for: "ONE generic pack
// whose config is a URL template plus a field allowlist. Still no free-form URLs."
//
// It lets a NEW tenant with their own JSON API get a live tool without anyone forking
// the code, while keeping every rule that makes packs safe:
//   - the base URL passes the same hard validation as every pack (https, no ports, no
//     internal hosts), and only an owner can set it;
//   - the path is a fixed, validated /segment/path — the model cannot steer the URL;
//   - the response is PROJECTED through an explicit field allowlist, so a huge or
//     hostile upstream payload never reaches the model;
//   - the model-facing description comes from config, so the operator says when to use it.

import type { ToolPack } from "./registry";
import { getJson } from "./registry";

const MAX_ITEMS = 50;

/** Keep only allowlisted keys; arrays are trimmed and projected per item. */
export function projectFields(payload: unknown, fields: string[]): unknown {
  const pick = (obj: Record<string, unknown>) =>
    Object.fromEntries(fields.filter((f) => f in obj).map((f) => [f, obj[f]]));
  if (Array.isArray(payload)) {
    return payload
      .slice(0, MAX_ITEMS)
      .map((item) => (item && typeof item === "object" ? pick(item as Record<string, unknown>) : item));
  }
  if (payload && typeof payload === "object") return pick(payload as Record<string, unknown>);
  return payload;
}

const fetchJson: ToolPack = {
  id: "fetch_json",
  family: "generic",
  description:
    "Read one JSON endpoint of the business's own website and hand the model only the " +
    "fields you allowlist. For businesses whose API no ready-made pack fits.",
  label: "Checking our website",
  definition: {
    type: "function",
    function: {
      name: "fetch_json",
      description: "Live data from the business's website.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  definitionFor(config) {
    return {
      type: "function",
      function: {
        name: "fetch_json",
        // The operator says when the model should reach for this; a vague description
        // here is the #1 reason a generic tool never gets called.
        description: config.toolDescription || "Live data from the business's website.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    };
  },
  configFields: [
    { key: "baseUrl", label: "Site base URL", type: "url", required: true },
    {
      key: "path",
      label: "Endpoint path",
      type: "path",
      required: true,
      placeholder: "/api/opening-status/",
      help: "Fixed path appended to the base URL. The model can never change it.",
    },
    {
      key: "fields",
      label: "Fields to pass through",
      type: "text",
      required: true,
      placeholder: "name, status, until",
      help: "Comma-separated allowlist. Everything else in the response is dropped before the model sees it.",
    },
    {
      key: "toolDescription",
      label: "When should the assistant use this?",
      type: "text",
      required: true,
      placeholder: "Current queue length and table availability. Use for wait-time questions.",
      help: "Written for the model: one sentence on what this returns and which questions it answers.",
    },
  ],
  async run(config) {
    const fields = (config.fields ?? "")
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
    const payload = await getJson(`${config.baseUrl}${config.path}`);
    return JSON.stringify(projectFields(payload, fields));
  },
};

export const GENERIC_PACKS = [fetchJson];
