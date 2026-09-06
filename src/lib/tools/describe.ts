// Plain-words contract of a tool for the admin: what it is called, what the model can
// pass in, what comes back. Read from the same definition the model sees, so the
// glossary cannot drift from the code.

import { TOOL_PACKS } from "./index";

export interface ToolInput {
  name: string;
  description: string;
  required: boolean;
}

export interface ToolDescription {
  id: string;
  label: string;
  description: string;
  inputs: ToolInput[];
  returns: string;
}

interface JsonSchemaObject {
  properties?: Record<string, { description?: string }>;
  required?: string[];
}

export function describeTool(id: string): ToolDescription | null {
  const pack = TOOL_PACKS[id];
  if (!pack) return null;
  const fn = pack.definition.type === "function" ? pack.definition.function : undefined;
  const schema = (fn?.parameters ?? {}) as JsonSchemaObject;
  const required = new Set(schema.required ?? []);
  const inputs = Object.entries(schema.properties ?? {}).map(([name, prop]) => ({
    name,
    description: prop.description ?? "",
    required: required.has(name),
  }));
  return { id, label: pack.label, description: pack.description, inputs, returns: pack.returns };
}
