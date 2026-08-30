// GET /admin/export?conversation=<id>  or  ?tenant=<id>
//
// Transcript export as a JSON download. A route handler (not a server action) because
// actions cannot stream a file; safe without CSRF protection because it is a read-only
// GET gated on the admin session cookie, owner role required, and no CORS headers are
// ever emitted under /admin.

import { asc, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { dbRoot } from "@/db";
import { conversations, messages } from "@/db/schema";
import { getAdminSession } from "@/lib/admin-auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== "owner") {
    return Response.json({ error: "owner session required" }, { status: 403 });
  }

  const conversationId = request.nextUrl.searchParams.get("conversation");
  const tenantId = request.nextUrl.searchParams.get("tenant");
  const id = conversationId ?? tenantId;
  if (!id || !UUID_PATTERN.test(id)) {
    return Response.json({ error: "pass ?conversation=<uuid> or ?tenant=<uuid>" }, { status: 400 });
  }

  const rows = await dbRoot
    .select()
    .from(conversations)
    .where(conversationId ? eq(conversations.id, id) : eq(conversations.tenantId, id));
  if (rows.length === 0) return Response.json({ error: "not found" }, { status: 404 });

  const allMessages = await dbRoot
    .select({
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      model: messages.model,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, rows.map((row) => row.id)))
    .orderBy(asc(messages.createdAt));

  const payload = rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    lastMessageAt: row.lastMessageAt,
    originHost: row.originHost,
    messages: allMessages
      .filter((message) => message.conversationId === row.id)
      .map(({ conversationId: _dropped, ...message }) => message),
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="michi-export-${stamp}.json"`,
    },
  });
}
