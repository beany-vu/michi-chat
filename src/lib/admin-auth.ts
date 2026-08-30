// Admin authentication with two roles.
//
//   owner — everything: tenants, keys, origins, tools, user management.
//   staff — the day-to-day: read conversations/usage, manage knowledge-base documents.
//
// Two ways in: a user account (admin_users, per-user scrypt hash), or the env
// ADMIN_PASSWORD as a break-glass OWNER login. The env path is why a fresh install works
// before any user exists and a forgotten password never locks the platform.
//
// Still no auth library: scrypt + a random session token + a cookie, all from
// node:crypto. Sessions are stored (revocable), and the role is snapshotted at login;
// user-backed sessions also re-check the user's status on every request, so disabling a
// staff account takes effect immediately.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { isRateLimited } from "./rate-limit";
import { hashToken } from "./tenant";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = "michi_admin";
const SESSION_TTL_HOURS = 12;
const LEGACY_SALT = "michi-admin-v1";

export type AdminRole = "owner" | "staff";
export interface AdminSession {
  role: AdminRole;
  userId: string | null;
}

/** "scrypt:<saltHex>:<hashHex>" with a per-user random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 32);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(candidate: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const hash = await scrypt(candidate, salt, 32);
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

async function envPasswordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Hash both sides to fixed-length buffers first: timingSafeEqual throws on a length
  // mismatch, which would itself leak the password length.
  const [a, b] = await Promise.all([
    scrypt(candidate, LEGACY_SALT, 32),
    scrypt(expected, LEGACY_SALT, 32),
  ]);
  return timingSafeEqual(a, b);
}

async function issueSession(role: AdminRole, userId: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000);
  await dbRoot.insert(adminSessions).values({ tokenHash: hashToken(token), role, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Email empty = the break-glass owner (env ADMIN_PASSWORD). Email set = a user account.
 */
export async function login(email: string, password: string): Promise<boolean> {
  // Global (not per-IP) on purpose: client IP is spoofable without a trusted proxy, and
  // a handful of humans never need more than this. ~14k guesses/day at worst.
  if (await isRateLimited({ key: "admin-login", windowSeconds: 60, max: 10 })) {
    return false;
  }

  if (!email) {
    if (!(await envPasswordMatches(password))) return false;
    await issueSession("owner", null);
    return true;
  }

  const [user] = await dbRoot
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.email, email.toLowerCase()), eq(adminUsers.status, "active")))
    .limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return false;

  await issueSession(user.role, user.id);
  void dbRoot
    .update(adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsers.id, user.id))
    .catch(() => {});
  return true;
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await dbRoot.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE);
}

/** The session, or null. User-backed sessions require the user to still be active. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await dbRoot
    .select({
      role: adminSessions.role,
      userId: adminSessions.userId,
      userStatus: adminUsers.status,
    })
    .from(adminSessions)
    .leftJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(
      sql`${adminSessions.tokenHash} = ${hashToken(token)} and ${adminSessions.expiresAt} > now()`,
    )
    .limit(1);
  if (!row) return null;
  if (row.userId && row.userStatus !== "active") return null;
  return { role: row.role, userId: row.userId };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

/**
 * MUST be the first line of every server action that mutates anything.
 *
 * The footgun this exists for: a guard in admin/layout.tsx does NOT protect server
 * actions. Actions are posted to the page route and run BEFORE the layout re-renders, so
 * the layout's redirect fires too late to stop the mutation.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** For actions staff must never run: tenants, keys, origins, tools, users. */
export async function requireOwner(): Promise<AdminSession> {
  const session = await requireAdmin();
  if (session.role !== "owner") redirect("/admin");
  return session;
}
