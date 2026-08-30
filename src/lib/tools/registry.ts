// Tool packs. A tenant ENABLES a pack and supplies parameters; the platform owns the
// code, and the URL is built from an operator-set base. Tenants never supply a raw URL.
//
// Why not a generic "call this URL" tool, which is the obvious data-driven design:
//
//   1. SSRF. This process can reach the WSL host's Ollama on :11434 UNAUTHENTICATED - an
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
  /** "url" is validated hard on save (https, no ports, no internal hosts); "path" must
   *  be a bare /segment/path; "text" is free-form. */
  type: "url" | "text" | "path";
  placeholder?: string;
  required?: boolean;
  /** Shown under the field in the admin form. */
  help?: string;
}

/** Supplied by the platform per call, never by tenant config. */
export interface ToolContext {
  tenantId: string;
}

export interface ToolPack {
  id: string;
  /** Groups the admin catalog: "generic" fits any business; others name the API shape
   *  they were built for. */
  family: "generic" | "mugshot-cms";
  /** One admin-facing sentence: what this pack does and who it is for. */
  description: string;
  /** Shown to the model. */
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  /** Per-tenant definition override (e.g. the generic pack builds its model-facing
   *  description from config). Falls back to `definition`. */
  definitionFor?(config: Record<string, string>): OpenAI.Chat.Completions.ChatCompletionTool;
  /** Shown to the visitor as a live chip, e.g. "Checking the menu". */
  label: string;
  /** Drives the admin form, so adding a pack grows the UI automatically. */
  configFields: ToolConfigField[];
  run(config: Record<string, string>, args: string, ctx: ToolContext): Promise<string>;
}

export const USER_AGENT = { "User-Agent": "michi-chat/0.1" };

// Short in-process cache of upstream GETs. A cafe's menu, weather and events do not change
// second to second, and re-fetching them on every turn (and for every visitor) is what made
// "what should I drink today?" feel slow. 60s is fresh enough for a cafe and turns a repeat
// tool call into a memory read. Process-local, which is exactly right for a single container.
const TOOL_CACHE_TTL_MS = 60_000;
// A slow upstream must not hold a visitor. 6s worst case, then the tool returns an error the
// model apologizes for, instead of a 15s hang that makes people quit (real feedback).
const TOOL_FETCH_TIMEOUT_MS = 6_000;
const toolCache = new Map<string, { at: number; data: unknown }>();

/**
 * Shared fetch for packs. redirect:"manual" is deliberate - following redirects would let
 * a 302 walk past the base-URL validation done when the operator saves the config.
 * Cached for TOOL_CACHE_TTL_MS keyed by URL.
 */
export async function getJson(url: string): Promise<unknown> {
  const hit = toolCache.get(url);
  if (hit && Date.now() - hit.at < TOOL_CACHE_TTL_MS) return hit.data;

  const response = await fetch(url, {
    headers: USER_AGENT,
    redirect: "manual",
    signal: AbortSignal.timeout(TOOL_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  const data = await response.json();
  toolCache.set(url, { at: Date.now(), data });
  // Bound the map; these keys are few (a handful of endpoints) but never trust that.
  if (toolCache.size > 200) toolCache.delete(toolCache.keys().next().value as string);
  return data;
}
