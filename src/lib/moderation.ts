import type { TenantKind } from "./prompt";

// Extracted so the provider-error detector is unit-testable without importing the route.
export const FRIENDLY_ERROR =
  "Sorry, I could not answer that one just now. Please try asking a different way, or ask our staff at the counter.";

const COACH_FRIENDLY_ERROR =
  "Sorry, I could not answer that one just now. Please try again in a moment.";

/** The visitor-facing line for a failed or empty model answer, worded for the tenant kind. */
export function friendlyError(kind: TenantKind): string {
  return kind === "coach" ? COACH_FRIENDLY_ERROR : FRIENDLY_ERROR;
}

/** True when model "content" is actually an upstream error payload rather than an answer. */
export function looksLikeProviderError(text: string): boolean {
  const t = text.trim();
  if (/^\{\s*"error"/.test(t)) return true;
  return /flagged as unsafe|content moderation|moderation warning|litellm\.\w|unsupportedparams/i.test(t);
}
