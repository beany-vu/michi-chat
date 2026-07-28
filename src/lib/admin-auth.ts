// Admin authentication. One operator, one password, no users table and no auth library.
//
// NextAuth would bring an adapter, four tables and a catch-all route to serve a single
// user with a single password, and would teach NextAuth rather than authentication. This
// is scrypt + a random session token + a cookie, all from node:crypto.
//
// The sessions ARE stored (see admin_sessions) rather than signed statelessly, because a
// stateless token cannot be revoked, and the table costs nothing next to the DB we run.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { adminSessions } from "@/db/schema";
import { hashToken } from "./tenant";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = "michi_admin";
const SESSION_TTL_HOURS = 12;
const SALT = "michi-admin-v1";

async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Hash both sides to fixed-length buffers first: timingSafeEqual throws on a length
  // mismatch, which would itself leak the password length.
  const [a, b] = await Promise.all([scrypt(candidate, SALT, 32), scrypt(expected, SALT, 32)]);
  return timingSafeEqual(a, b);
}

export async function login(password: string): Promise<boolean> {
  if (!(await passwordMatches(password))) return false;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000);
  await dbRoot.insert(adminSessions).values({ tokenHash: hashToken(token), expiresAt });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
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

export async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const [row] = await dbRoot
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(sql`${adminSessions.tokenHash} = ${hashToken(token)} and ${adminSessions.expiresAt} > now()`)
    .limit(1);
  return Boolean(row);
}

/**
 * MUST be the first line of every server action that mutates anything.
 *
 * The footgun this exists for: a guard in admin/layout.tsx does NOT protect server
 * actions. Actions are posted to the page route and run BEFORE the layout re-renders, so
 * the layout's redirect fires too late to stop the mutation.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/admin/login");
}
