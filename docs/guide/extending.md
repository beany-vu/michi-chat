# Extending with tool packs

A tool is what lets the bot fetch live facts — a menu, the weather, stock. In michi-chat, tools are **code packs**: the platform owns the code; a tenant enables a pack and fills in parameters through the admin form. There is deliberately no runtime plugin system (see why below).

## Anatomy of a pack

One file in `src/lib/tools/`, implementing five fields:

```ts
import { getJson, type ToolPack } from "./registry";

const openingStatus: ToolPack = {
  id: "get_opening_status",
  label: "Checking if we're open",       // the live chip visitors see
  definition: {                          // what the model sees
    type: "function",
    function: {
      name: "get_opening_status",
      description: "Whether the business is open right now, and when it next opens.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  configFields: [                        // drives the admin form automatically
    { key: "baseUrl", label: "Site base URL", type: "url", required: true },
  ],
  async run(config, _args, ctx) {        // ctx.tenantId is platform-supplied
    const data = await getJson(`${config.baseUrl}/api/hours/`);
    // Project to a handful of fields: the result is re-sent on EVERY loop round.
    return JSON.stringify({ open: data.open, nextChange: data.nextChange });
  },
};

export const MY_PACKS = [openingStatus];
```

Register it with one line in `src/lib/tools/index.ts`, and the admin form grows the new pack's fields by itself. Then build your own image:

```bash
docker build -t my-michi .
# quickstart .env:  MICHI_IMAGE=my-michi
```

## Two rules packs must respect

1. **Project the response.** Return a handful of fields, never the raw upstream payload — tool results are paid input tokens on every subsequent round, and a huge payload blows a small model's context.
2. **URLs come from the operator, validated.** `configFields` of type `url` are validated on save (https only, no ports, no internal hosts). Never fetch anything a visitor's message contains.

## Before you fork: the generic pack

Many "we need a custom tool" cases don't need code at all. The built-in **fetch_json** pack
(under "For every business" on the tenant form) reads one JSON endpoint of the tenant's own
site: you set the base URL (hard-validated), a fixed path, a **field allowlist** (everything
else is dropped before the model sees it), and one sentence telling the model when to use it.
Fork only when you need real logic — multiple calls, reshaping, math.

## Why there is no plugin system

A runtime-loaded plugin is arbitrary code executing inside the container that can reach the database and the model host. The platform's security model rests on tenants supplying only *parameters* to trusted code. Fork-and-build gives you the same extensibility with every executing line reviewable — and the `ToolPack` interface keeps the cost of that to one file.
