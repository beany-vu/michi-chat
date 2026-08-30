// Tenant resolution for the public chat endpoint, plus the CORS rules that go with it.
//
// This lives in a plain function called from the route, NOT in middleware.ts, and that is
// forced rather than stylistic: middleware runs on the Edge runtime, where the `postgres`
// driver (raw TCP sockets) and `node:crypto` are both unavailable. Any DB-backed
// resolution has to happen in the route.

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { dbRoot } from "@/db";
import { apiKeys, tenants, widgetSessions } from "@/db/schema";
import { isRateLimited } from "./rate-limit";

const SESSION_TTL_DAYS = 30;
// Sized against the worst case for one turn: 6 rounds x a 15s tool timeout, plus the
// model calls. Requests per minute matters less than how many can be in flight.
const PER_SESSION_PER_MINUTE = 12;
const PER_IP_PER_MINUTE = 30;
// New sessions minted per tenant per day. The per-IP limit is spoofable without a
// trusted proxy (the header is client-controlled), and a caller who simply never
// presents a session token would otherwise mint one row per request. This bounds the
// table; the daily message cap bounds the bill.
const SESSIONS_MINTED_PER_DAY = 1000;

export type Tenant = typeof tenants.$inferSelect;

export interface Resolved {
  ok: true;
  tenant: Tenant;
  apiKeyId: string;
  sessionId: string;
  /** Set only when a session was just created, so the route can hand it to the client. */
  issuedSessionToken: string | null;
  origin: string | null;
}

export interface Rejected {
  ok: false;
  status: 401 | 403 | 413 | 429;
  error: string;
  /** Whether the response may carry CORS headers (i.e. we trust the origin). */
  corsOk: boolean;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** "https://Example.com:443/" -> "https://example.com:443". Applied on write AND read. */
export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Is this origin registered for ANY active tenant?
 *
 * Used by the preflight, which carries no embed key — only an Origin — so it cannot check
 * the key/origin pair. The POST does that. All this leaks is "some tenant uses this
 * origin", which the widget snippet on that page already announces.
 */
export async function isOriginRegistered(origin: string): Promise<boolean> {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  const [row] = await dbRoot
    .select({ one: sql<number>`1` })
    .from(tenants)
    .where(and(eq(tenants.status, "active"), sql`${normalized} = any(${tenants.allowedOrigins})`))
    .limit(1);
  return Boolean(row);
}

function clientIp(request: NextRequest): string {
  // No proxy in front of this today. Once there is one, read a fixed number of hops from
  // the RIGHT of x-forwarded-for; trusting the leftmost value is client-controlled.
  return request.headers.get("x-real-ip") ?? "local";
}

export async function resolveTenant(request: NextRequest): Promise<Resolved | Rejected> {
  const rawKey = request.headers.get("x-embed-key")?.trim();
  if (!rawKey) return { ok: false, status: 401, error: "missing embed key", corsOk: false };

  const [row] = await dbRoot
    .select({ tenant: tenants, keyId: apiKeys.id, kind: apiKeys.kind })
    .from(apiKeys)
    .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
    .where(and(eq(apiKeys.publicKey, rawKey), isNull(apiKeys.revokedAt)))
    .limit(1);

  // A secret key must never work here. One lookup shared by the public and admin surfaces,
  // without this check, is the classic privilege-escalation hole.
  if (!row || row.kind !== "public") {
    return { ok: false, status: 401, error: "invalid embed key", corsOk: false };
  }
  if (row.tenant.status !== "active") {
    return { ok: false, status: 403, error: "tenant is disabled", corsOk: false };
  }

  // Origin check. Browser-enforced only, so this is scoping, not security: it stops another
  // website embedding this tenant's bot, and does nothing at all against curl. The daily
  // cap is what protects the bill.
  const rawOrigin = request.headers.get("origin");
  let origin: string | null = null;
  if (rawOrigin) {
    origin = normalizeOrigin(rawOrigin);
    const allowed = origin !== null && row.tenant.allowedOrigins.includes(origin);
    if (!allowed) {
      return { ok: false, status: 403, error: "origin not allowed", corsOk: false };
    }
  }

  const ip = clientIp(request);
  if (await isRateLimited({ key: `ip:${ip}`, windowSeconds: 60, max: PER_IP_PER_MINUTE })) {
    return { ok: false, status: 429, error: "too many requests", corsOk: true };
  }

  // Resolve or mint the visitor session. This replaces the old client-supplied anonId,
  // which the client generated itself: useless as identity, and useless as a rate-limit
  // key because a caller can rotate it every request.
  const presented = request.headers.get("x-michi-session")?.trim() || null;
  let sessionId: string | null = null;
  let issuedSessionToken: string | null = null;

  if (presented) {
    const [session] = await dbRoot
      .select({ id: widgetSessions.id })
      .from(widgetSessions)
      .where(
        and(
          eq(widgetSessions.tokenHash, hashToken(presented)),
          eq(widgetSessions.tenantId, row.tenant.id),
          sql`${widgetSessions.expiresAt} > now()`,
        ),
      )
      .limit(1);
    if (session) {
      sessionId = session.id;
      void dbRoot
        .update(widgetSessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(widgetSessions.id, session.id))
        .catch(() => {});
    }
  }

  if (!sessionId) {
    if (
      await isRateLimited({
        key: `mint:${row.tenant.id}`,
        windowSeconds: 86_400,
        max: SESSIONS_MINTED_PER_DAY,
      })
    ) {
      return { ok: false, status: 429, error: "too many requests", corsOk: true };
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
    const [created] = await dbRoot
      .insert(widgetSessions)
      .values({ tenantId: row.tenant.id, tokenHash: hashToken(token), expiresAt })
      .returning({ id: widgetSessions.id });
    sessionId = created.id;
    issuedSessionToken = token;
  }

  if (
    await isRateLimited({ key: `sess:${sessionId}`, windowSeconds: 60, max: PER_SESSION_PER_MINUTE })
  ) {
    return { ok: false, status: 429, error: "too many requests", corsOk: true };
  }

  void dbRoot
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.keyId))
    .catch(() => {});

  return {
    ok: true,
    tenant: row.tenant,
    apiKeyId: row.keyId,
    sessionId,
    issuedSessionToken,
    origin,
  };
}

/**
 * CORS headers for one response.
 *
 * Reflect the exact matched origin, never "*", and always send Vary: Origin — without it
 * any cache in front of this serves tenant A's Allow-Origin header to tenant B.
 *
 * Allow-Credentials is deliberately absent: the session is a bearer header, not a cookie,
 * so there is no ambient authority for a reflection bug to leak.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

/** JSON error carrying CORS headers, so the widget can read the reason instead of seeing
 *  an opaque CORS failure. This is the most commonly missed piece of a CORS setup. */
export function corsJson(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}
