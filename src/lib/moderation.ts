// Extracted so the provider-error detector is unit-testable without importing the route.
export const FRIENDLY_ERROR =
  "Sorry, I could not answer that one just now. Please try asking a different way, or ask our staff at the counter.";

/** True when model "content" is actually an upstream error payload rather than an answer. */
export function looksLikeProviderError(text: string): boolean {
  const t = text.trim();
  if (/^\{\s*"error"/.test(t)) return true;
  return /flagged as unsafe|content moderation|moderation warning|litellm\.\w|unsupportedparams/i.test(t);
}
