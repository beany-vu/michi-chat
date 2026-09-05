// Import (or update) a tenant from a michi-tenant JSON file, the same path the admin UI's
// upload takes, and print its public keys. For instances set up from the command line:
//   docker compose exec app npm run tenant:import -- /app/tenant.json

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { dbRoot } from "../src/db";
import { apiKeys, tenants } from "../src/db/schema";
import { importTenant } from "../src/lib/tenant-transfer";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx scripts/import-tenant.ts <tenant.json>");
    process.exit(1);
  }
  const payload = JSON.parse(readFileSync(file, "utf8"));
  console.log(await importTenant(payload));
  const [tenant] = await dbRoot.select().from(tenants).where(eq(tenants.slug, payload.tenant.slug)).limit(1);
  const keys = await dbRoot.select().from(apiKeys).where(eq(apiKeys.tenantId, tenant.id));
  for (const key of keys) {
    if (key.kind === "public" && !key.revokedAt) console.log(`public key (${key.name}): ${key.publicKey}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
