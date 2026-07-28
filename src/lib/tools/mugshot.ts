// The mugshot packs. These are the original three executors, unchanged in behaviour: the
// only difference is that the base URL and the price note come from tenant config instead
// of a module constant. Any cafe running the same CMS shape can enable them.

import { getJson, type ToolPack } from "./registry";

const weather: ToolPack = {
  id: "get_weather",
  label: "Checking the weather",
  definition: {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Current weather at the cafe. Use it when the customer asks about weather or " +
        "wants a drink suggestion that should fit the weather.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  configFields: [
    { key: "baseUrl", label: "Site base URL", type: "url", required: true },
  ],
  async run(config) {
    const data = (await getJson(`${config.baseUrl}/api/weather/`)) as Record<string, unknown>;
    return JSON.stringify({
      temperatureC: data.temperature,
      feelsLikeC: data.feelsLike,
      condition: data.condition,
      weatherTag: data.weatherTag,
    });
  },
};

const menu: ToolPack = {
  id: "get_menu",
  label: "Checking the menu",
  definition: {
    type: "function",
    function: {
      name: "get_menu",
      description:
        "The full standing menu (drinks and food) with categories and descriptions. " +
        "Use it for any menu, food, or drink question.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  configFields: [
    { key: "baseUrl", label: "Site base URL", type: "url", required: true },
    { key: "priceNote", label: "Price note (sent with every menu result)", type: "text" },
  ],
  async run(config) {
    const payload = (await getJson(`${config.baseUrl}/api/menu/`)) as {
      items: { data: Record<string, { iv: unknown }> }[];
    };
    const seen = new Set<string>();
    const items = [];
    for (const entry of payload.items) {
      // The CMS wraps every field as { iv: value }; flatten before doing anything else.
      const flat = Object.fromEntries(
        Object.entries(entry.data).map(([key, value]) => [key, value?.iv]),
      );
      if (flat.isActive === false) continue;
      const key = `${flat.name}|${flat.subcategory}`;
      if (seen.has(key)) continue; // upstream CMS has duplicate rows
      seen.add(key);
      items.push({
        name: flat.name,
        category: flat.category,
        subcategory: flat.subcategory,
        description: flat.description || undefined,
      });
    }
    return JSON.stringify({ note: config.priceNote || undefined, items });
  },
};

const specials: ToolPack = {
  id: "get_specials",
  label: "Checking the specials",
  definition: {
    type: "function",
    function: {
      name: "get_specials",
      description:
        "Current seasonal specials and retail products (beans, merch) with availability. " +
        "Use it for what's new or seasonal.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  configFields: [
    { key: "baseUrl", label: "Site base URL", type: "url", required: true },
  ],
  async run(config) {
    const products = (await getJson(`${config.baseUrl}/api/products/`)) as Record<
      string,
      unknown
    >[];
    return JSON.stringify(
      products
        .filter((product) => product.isActive !== false)
        .map((product) => ({
          name: product.name,
          category: product.category,
          description: product.description,
          availability: product.availability,
        })),
    );
  },
};

export const MUGSHOT_PACKS = [weather, menu, specials];
