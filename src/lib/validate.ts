// Shared URL/path gates for tool config, used by both the admin form path and the
// tenant-import path. This process can reach the host's unauthenticated Ollama, the DB
// and LiteLLM, so these are security checks, not formatting checks.

export function validateBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error(`${raw}: must be https`);
  if (url.port) throw new Error(`${raw}: explicit ports are not allowed`);
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":");
  if (blocked) throw new Error(`${raw}: host is not allowed`);
  return `${url.protocol}//${url.host}`;
}

/** A fixed endpoint path for the generic pack: absolute, no query, no traversal. */
export function validatePath(raw: string): string {
  if (!/^\/[A-Za-z0-9/_.-]*$/.test(raw) || raw.includes("..") || raw.includes("//")) {
    throw new Error(`${raw}: path must look like /api/something/ with no query or ..`);
  }
  return raw;
}
