// Which tenants an admin session may see. Owners (and the env-password break-glass
// login) are unscoped. Staff see exactly the tenants an owner assigned them, and a
// staff account with NO assignment sees nothing: a new account is safe by default
// until someone decides what it is for. Every staff-reachable query ANDs `tenantScope`
// in, and every tenant-addressed page or action checks `canSeeTenant` first; hiding
// links in the sidebar is UX, these two are the boundary.

import { inArray, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

export interface ScopedSession {
  role: "owner" | "staff";
  /** null = unscoped (owner). An array, possibly empty, for staff. */
  tenantIds: string[] | null;
}

export type ScopeKind = "all" | "none" | "some";

export function scopeKind(session: ScopedSession): ScopeKind {
  if (session.tenantIds === null) return "all";
  return session.tenantIds.length === 0 ? "none" : "some";
}

export function canSeeTenant(session: ScopedSession, tenantId: string): boolean {
  return session.tenantIds === null || session.tenantIds.includes(tenantId);
}

/** Keep only the rows whose tenant the session may see. */
export function visibleTenants<T extends { id: string }>(session: ScopedSession, rows: T[]): T[] {
  return session.tenantIds === null ? rows : rows.filter((row) => canSeeTenant(session, row.id));
}

/** A WHERE fragment for a tenant-id column: `true`, `false`, or `col in (...)`. */
export function tenantScope(session: ScopedSession, column: AnyColumn): SQL {
  switch (scopeKind(session)) {
    case "all":
      return sql`true`;
    case "none":
      return sql`false`;
    case "some":
      return inArray(column, session.tenantIds as string[]);
  }
}

/** Same fragment for hand-written SQL, where the column is a raw name like `t.id`. */
export function tenantScopeRaw(session: ScopedSession, column: string): SQL {
  switch (scopeKind(session)) {
    case "all":
      return sql`true`;
    case "none":
      return sql`false`;
    case "some":
      return sql`${sql.raw(column)} in (${sql.join(
        (session.tenantIds as string[]).map((id) => sql`${id}`),
        sql`, `,
      )})`;
  }
}
