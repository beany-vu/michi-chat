import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  // Real migrations, not push. Once tenants land, a schema change means seed + backfill
  // + SET NOT NULL against existing rows, which push cannot express.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://michi@localhost:5435/michichat",
  },
});
