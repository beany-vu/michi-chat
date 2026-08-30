// The knowledge-base pack. Retrieval-as-a-tool rather than always-on injection: the
// model decides when a question needs the KB, the visitor sees a "Checking our info"
// chip, and a tenant with no documents simply leaves the pack disabled. Tenancy comes
// from ToolContext (platform-supplied), never from config.

import { searchKb } from "@/lib/rag";
import type { ToolPack } from "./registry";

const TOP_K = 5;
// A hit whose cosine distance is worse than this is noise for nomic-embed-text; better
// to tell the model "nothing found" (which the prompt turns into an honest "I don't
// know") than to hand it a barely-related chunk to paraphrase from.
const MAX_DISTANCE = 0.55;

const searchKbPack: ToolPack = {
  id: "search_kb",
  family: "generic",
  description: "Answers from this tenant's own Facts & knowledge documents. Fits every business; enable it once there are documents.",
  label: "Checking our info",
  definition: {
    type: "function",
    function: {
      name: "search_kb",
      description:
        "Search the business's own knowledge base (hours, location, policies, FAQs, " +
        "product details). Use it for any factual question about the business that " +
        "another tool does not answer.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The visitor's question, rephrased as a short standalone query.",
          },
        },
        required: ["query"],
      },
    },
  },
  configFields: [],
  async run(_config, args, ctx) {
    let query = "";
    try {
      const parsed = JSON.parse(args) as { query?: unknown };
      if (typeof parsed.query === "string") query = parsed.query.trim();
    } catch {
      // Some models emit bare strings instead of JSON; take them as-is.
      query = args.trim();
    }
    if (!query) return JSON.stringify({ error: "query is required" });

    const hits = (await searchKb(ctx.tenantId, query.slice(0, 500), TOP_K)).filter(
      (hit) => hit.distance <= MAX_DISTANCE,
    );
    if (hits.length === 0) {
      return JSON.stringify({
        results: [],
        note: "Nothing relevant in the knowledge base. Say you do not know rather than guessing.",
      });
    }
    return JSON.stringify({
      results: hits.map((hit) => ({ section: hit.heading, text: hit.content })),
    });
  },
};

export const KB_PACKS = [searchKbPack];
