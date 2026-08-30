// Container entrypoint: run pending migrations, then start the standalone Next server.
//
// Plain ESM on purpose — no tsx, no drizzle-kit, no build step. drizzle-orm's programmatic
// migrator reads the same drizzle/ folder and records into the same __drizzle_migrations
// table as drizzle-kit, so dev (drizzle-kit migrate) and this entrypoint are interchangeable
// against one database.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  // No localhost fallback here: inside a container a fallback DSN is always wrong, and a
  // clear sentence beats a connection-refused stack trace.
  console.error("DATABASE_URL is not set. Set it to your Postgres DSN, e.g. postgres://michi:…@db:5432/michichat");
  process.exit(1);
}

// The DB container may still be starting; compose healthchecks usually cover this, but
// plain `docker run` users deserve a retry loop instead of a crash.
const DEADLINE_MS = 30_000;
const started = Date.now();
for (;;) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    await sql.end();
    break;
  } catch (error) {
    await sql.end().catch(() => {});
    if (Date.now() - started > DEADLINE_MS) {
      console.error("migrations failed:", error?.message ?? error);
      process.exit(1);
    }
    console.log("database not ready, retrying…");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
console.log("migrations up to date");

await import("./server.js");
