// GET /admin/tenant-export?tenant=<id> - the whole tenant as one JSON file (settings +
// KB source text; embeddings never travel). Owner only: the file includes the Slack
// webhook and the full tool config.

import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { logAudit } from "@/lib/audit";
import { exportTenant } from "@/lib/tenant-transfer";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "owner") {
    return Response.json({ error: "owner session required" }, { status: 403 });
  }
  const tenantId = request.nextUrl.searchParams.get("tenant");
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    return Response.json({ error: "pass ?tenant=<uuid>" }, { status: 400 });
  }
  const payload = await exportTenant(tenantId);
  if (!payload) return Response.json({ error: "not found" }, { status: 404 });
  logAudit(session, "tenant.export", payload.tenant.slug);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tenant-${payload.tenant.slug}.json"`,
    },
  });
}
