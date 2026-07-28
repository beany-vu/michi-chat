// Loading a tenant for server-rendered pages (/ and /t/[slug]).
//
// A page needs a public embed key to hand the widget. In production the key would be
// pasted into the customer's site by hand; for the pages this app serves itself we just
// pick the tenant's oldest live public key.

import { and, asc, eq, isNull } from "drizzle-orm";
import { dbRoot } from "@/db";
import { apiKeys, tenants } from "@/db/schema";

export async function loadTenantBySlug(slug: string) {
  const [tenant] = await dbRoot
    .select()
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.status, "active")))
    .limit(1);
  if (!tenant) return null;

  const [key] = await dbRoot
    .select({ publicKey: apiKeys.publicKey })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.tenantId, tenant.id),
        eq(apiKeys.kind, "public"),
        isNull(apiKeys.revokedAt),
      ),
    )
    .orderBy(asc(apiKeys.createdAt))
    .limit(1);

  if (!key?.publicKey) return null;
  return { tenant, embedKey: key.publicKey };
}

export const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "mugshot";
