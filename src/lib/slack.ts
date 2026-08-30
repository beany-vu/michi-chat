// Per-tenant Slack notifications.
//
// This is the ONE deliberate exception to the "no tenant-supplied URLs" rule, and it is
// only acceptable because the validator pins the URL to a single external host: exactly
// https://hooks.slack.com/services/… — never an IP, never a port, never a redirect
// followed. An SSRF needs a URL that can be aimed at Ollama, the DB, or LiteLLM; a URL
// that can only ever be hooks.slack.com cannot be aimed anywhere.
//
// Notifications are fire-and-forget: a dead webhook must never slow down or fail a chat
// turn, so notify() swallows every error after a console.warn.

const WEBHOOK_HOST = "hooks.slack.com";
const WEBHOOK_PATH_PREFIX = "/services/";
const MAX_TEXT_CHARS = 500;

/** Throws with an operator-readable message; returns the normalized URL string. */
export function validateSlackWebhookUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Slack webhook: not a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("Slack webhook: must be https");
  if (url.hostname.toLowerCase() !== WEBHOOK_HOST) {
    throw new Error(`Slack webhook: host must be ${WEBHOOK_HOST}`);
  }
  if (url.port) throw new Error("Slack webhook: explicit ports are not allowed");
  if (!url.pathname.startsWith(WEBHOOK_PATH_PREFIX)) {
    throw new Error(`Slack webhook: path must start with ${WEBHOOK_PATH_PREFIX}`);
  }
  if (url.username || url.password) throw new Error("Slack webhook: credentials are not allowed");
  // Rebuild instead of echoing raw input, dropping query/fragment.
  return `https://${WEBHOOK_HOST}${url.pathname}`;
}

/**
 * Post one plain-text notification. Never throws, never blocks the caller for more than
 * the timeout. Text is truncated: a visitor message is a snippet here, not a transcript.
 */
export async function notifySlack(webhookUrl: string | null, text: string): Promise<void> {
  if (!webhookUrl) return;
  const body =
    text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text;
  try {
    // Re-validate at send time so a bad value that somehow reached the DB still cannot
    // be fetched. Defence in depth against a future write path skipping the form.
    const url = validateSlackWebhookUrl(webhookUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.warn(`slack notify failed: ${response.status}`);
  } catch (error) {
    console.warn("slack notify failed", error instanceof Error ? error.message : error);
  }
}
