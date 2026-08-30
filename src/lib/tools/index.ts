// Turn a tenant's stored toolConfig into the three things the chat loop needs: the
// definitions to offer the model, the labels to show the visitor, and one executor.

import type { ToolConfig } from "@/db/schema";
import { GENERIC_PACKS } from "./generic";
import { KB_PACKS } from "./kb";
import { MUGSHOT_PACKS } from "./mugshot";
import type { ToolPack } from "./registry";

export const TOOL_PACKS: Record<string, ToolPack> = Object.fromEntries(
  [...MUGSHOT_PACKS, ...KB_PACKS, ...GENERIC_PACKS].map((pack) => [pack.id, pack]),
);

export interface TenantTools {
  definitions: ToolPack["definition"][];
  labelFor(name: string): string;
  execute(name: string, args: string): Promise<string>;
}

export function buildTenantTools(
  toolConfig: ToolConfig,
  tenantId: string,
  timezone = "UTC",
): TenantTools {
  const enabled = Object.entries(toolConfig ?? {}).filter(
    ([id, config]) => config?.enabled && TOOL_PACKS[id],
  );

  return {
    definitions: enabled.map(([id, rawConfig]) => {
      const pack = TOOL_PACKS[id];
      if (!pack.definitionFor) return pack.definition;
      const config = Object.fromEntries(
        Object.entries(rawConfig).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
      );
      return pack.definitionFor(config);
    }),

    labelFor: (name) => TOOL_PACKS[name]?.label ?? name,

    async execute(name, args) {
      // Never run a pack this tenant has not enabled, even if the model hallucinates the
      // name. The lookup goes through `enabled`, not through TOOL_PACKS.
      const entry = enabled.find(([id]) => id === name);
      if (!entry) return JSON.stringify({ error: `Unknown tool '${name}'` });

      const [id, rawConfig] = entry;
      const config = Object.fromEntries(
        Object.entries(rawConfig).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
      );
      try {
        return await TOOL_PACKS[id].run(config, args, { tenantId, timezone });
      } catch (error) {
        // Errors go back to the MODEL as JSON, so a dead upstream becomes an apology
        // rather than a failed turn.
        return JSON.stringify({
          error: `Tool '${name}' unavailable: ${error instanceof Error ? error.message : "failed"}`,
        });
      }
    },
  };
}

export type { ToolPack, ToolConfigField, ToolContext } from "./registry";
