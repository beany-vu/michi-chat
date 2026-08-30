// The raw, unscoped database handle. Named `dbRoot` rather than `db` on purpose: any
// tenant-facing query should go through forTenant() in ./tenant-db, and an import of
// `dbRoot` inside src/app/api/chat/ should look wrong in a diff. Admin code and tenant
// resolution legitimately use it, since they operate across tenants.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Dev-only singleton: Next's HMR re-evaluates this module on every recompile, and each
// evaluation would otherwise leak a whole connection pool. After a long editing session
// that ends in Postgres' "sorry, too many clients already". In production the module
// loads once and the global is never touched.
const globalForDb = globalThis as unknown as { __michiPgClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.__michiPgClient ??
  postgres(process.env.DATABASE_URL ?? "postgres://michi@localhost:5435/michichat");
if (process.env.NODE_ENV !== "production") globalForDb.__michiPgClient = client;

export const dbRoot = drizzle(client, { schema });

/** Only for scripts and tests: the pool keeps the process alive otherwise. */
export const closeDb = () => client.end({ timeout: 5 });
