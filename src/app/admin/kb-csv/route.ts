// GET /admin/kb-csv?tenant=<id> — the tenant's knowledge base as a two-column CSV
// (title, content). Staff-accessible: the KB is staff territory, and the export contains
// nothing a staff member can't already read on the KB page. Import is the matching
// server action (importKbCsvAction); together they are backup and bulk-edit.

import { asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { dbRoot } from "@/db";
import { kbDocuments, tenants } from "@/db/schema";
import { getAdminSession } from "@/lib/admin-auth";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "session required" }, { status: 403 });

  const tenantId = request.nextUrl.searchParams.get("tenant");
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    return Response.json({ error: "pass ?tenant=<uuid>" }, { status: 400 });
  }
  const [tenant] = await dbRoot
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return Response.json({ error: "not found" }, { status: 404 });

  const documents = await dbRoot
    .select({ title: kbDocuments.title, content: kbDocuments.content })
    .from(kbDocuments)
    .where(eq(kbDocuments.tenantId, tenantId))
    .orderBy(asc(kbDocuments.title));

  logAudit(session, "kb.export", `${tenant.slug} (${documents.length} docs)`);
  const csv = toCsv([["title", "content"], ...documents.map((d) => [d.title, d.content])]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kb-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
