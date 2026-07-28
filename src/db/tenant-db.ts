// Tenant-scoped data access. The point is ergonomics, not magic: these are the only
// conversation/message helpers the chat route needs, and each one already carries the
// tenant predicate, so there is no convenient way to write a leaky query.
//
// This is defence in depth, not the guarantee. The guarantee is the composite foreign key
// on messages (see schema.ts) — Postgres rejects a cross-tenant row outright. Row-Level
// Security would be a third layer, but it is deliberately NOT here yet: the `michi` role
// is a superuser, and superusers bypass RLS unconditionally (FORCE ROW LEVEL SECURITY
// does not help). RLS without a NOSUPERUSER app role is theatre. See README.

import { and, desc, eq, sql } from "drizzle-orm";
import { dbRoot } from ".";
import { conversations, messages } from "./schema";

const HISTORY_WINDOW = 12;

export function forTenant(tenantId: string) {
  return {
    /** Resume a conversation. Scoped by tenant AND session, both server-controlled. */
    async findConversation(id: string, sessionId: string | null) {
      const [row] = await dbRoot
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.tenantId, tenantId),
            // A conversation started before sessions existed has no session; anything with
            // one must present it, so a leaked conversationId alone is not enough.
            sessionId ? eq(conversations.sessionId, sessionId) : sql`${conversations.sessionId} is null`,
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async createConversation(input: {
      sessionId: string | null;
      apiKeyId: string | null;
      originHost: string | null;
    }) {
      const [row] = await dbRoot
        .insert(conversations)
        .values({ tenantId, ...input })
        .returning();
      return row;
    },

    /** Memory is rebuilt, not remembered: newest N turns, returned chronologically. */
    async recentMessages(conversationId: string) {
      const rows = await dbRoot
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, conversationId), eq(messages.tenantId, tenantId)))
        .orderBy(desc(messages.createdAt))
        .limit(HISTORY_WINDOW);
      return rows.reverse();
    },

    async appendMessage(input: Omit<typeof messages.$inferInsert, "tenantId">) {
      await dbRoot.insert(messages).values({ ...input, tenantId });
    },

    async touchConversation(conversationId: string) {
      await dbRoot
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)));
    },

    /** User turns since midnight, for the daily cap. Counts against the tenant, not the visitor. */
    async userMessagesToday() {
      const [row] = await dbRoot
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.tenantId, tenantId),
            eq(messages.role, "user"),
            sql`${messages.createdAt} >= date_trunc('day', now())`,
          ),
        );
      return row?.count ?? 0;
    },
  };
}

export type TenantDb = ReturnType<typeof forTenant>;
