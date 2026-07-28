// Tool packs. A tenant ENABLES a pack and supplies parameters; the platform owns the
// code, and the URL is built from an operator-set base. Tenants never supply a raw URL.
//
// Why not a generic "call this URL" tool, which is the obvious data-driven design:
//
//   1. SSRF. This process can reach the WSL host's Ollama on :11434 UNAUTHENTICATED — an
//      API that includes pull (fill the disk), delete (destroy the model the platform
//      runs on) and generate (unlimited free inference, bypassing every quota below). It
//      can also reach db:5432, litellm:4000, and itself. Doing arbitrary URLs safely means
//      resolving DNS yourself and connecting to the pinned IP through a custom undici
//      dispatcher, or DNS rebinding walks straight through the check. That is a lot of
//      security-critical code to hand-roll for a feature nobody has asked for.
//   2. Projection. Each pack below trims its response to a handful of fields, because a
//      tool result is re-sent on EVERY round of the loop. A generic executor cannot do
//      that without a projection mini-language, and the raw payload would blow a 4B
//      model's context window long before it blew a token budget.
//
// If a future client genuinely cannot be served by a pack, add ONE generic pack whose
// config is a URL template plus a field allowlist. Still no free-form URLs.

import type OpenAI from "openai";

export interface ToolConfigField {
  key: string;
  label: string;
  type: "url" | "text";
  placeholder?: string;
  required?: boolean;
}

export interface ToolPack {
  id: string;
  /** Shown to the model. */
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  /** Shown to the visitor as a live chip, e.g. "Checking the menu". */
  label: string;
  /** Drives the admin form, so adding a pack grows the UI automatically. */
  configFields: ToolConfigField[];
  run(config: Record<string, string>, args: string): Promise<string>;
}

export const USER_AGENT = { "User-Agent": "michi-chat/0.1" };

/**
 * Shared fetch for packs. redirect:"manual" is deliberate — following redirects would let
 * a 302 walk past the base-URL validation done when the operator saves the config.
 */
export async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: USER_AGENT,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}
