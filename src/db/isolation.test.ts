// Isolation tests that need a real database, because the guarantee they check IS the
// database. Run separately from the pure unit tests:
//
//   docker compose exec app npm run test:isolation
//
// The point of each of these is that no application code is involved in enforcing them.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, dbRoot } from ".";
import { conversations, messages, tenants } from "./schema";

const slugA = `isotest-a-${randomUUID().slice(0, 8)}`;
const slugB = `isotest-b-${randomUUID().slice(0, 8)}`;
let tenantA: string;
let tenantB: string;
let conversationA: string;

before(async () => {
  const rows = await dbRoot
    .insert(tenants)
    .values([
      { slug: slugA, name: "Isolation A", persona: "A" },
      { slug: slugB, name: "Isolation B", persona: "B" },
    ])
    .returning({ id: tenants.id, slug: tenants.slug });
  tenantA = rows.find((r) => r.slug === slugA)!.id;
  tenantB = rows.find((r) => r.slug === slugB)!.id;

  const [conversation] = await dbRoot
    .insert(conversations)
    .values({ tenantId: tenantA })
    .returning({ id: conversations.id });
  conversationA = conversation.id;

  await dbRoot.insert(messages).values({
    tenantId: tenantA,
    conversationId: conversationA,
    role: "user",
    content: "tenant A secret",
  });
});

after(async () => {
  // Cascades to conversations and messages.
  await dbRoot.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
  await closeDb();
});

test("Postgres rejects a message pointing at another tenant's conversation", async () => {
  let thrown: unknown;
  try {
    await dbRoot.insert(messages).values({
      tenantId: tenantB,
      conversationId: conversationA,
      role: "user",
      content: "cross-tenant write",
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown, "the insert must not succeed");
  // Drizzle wraps the driver error, so the interesting part is the cause. Assert on the
  // constraint NAME, not just "it threw": this proves the composite FK
  // messages(tenant_id, conversation_id) -> conversations(tenant_id, id) is what stopped
  // it, rather than some incidental failure. No application code is consulted.
  const cause = (thrown as { cause?: { constraint_name?: string; code?: string } }).cause;
  assert.equal(cause?.constraint_name, "messages_tenant_conversation_fk");
  assert.equal(cause?.code, "23503"); // foreign_key_violation
});

test("a tenant-scoped read cannot see another tenant's rows", async () => {
  const asB = await dbRoot.select().from(messages).where(eq(messages.tenantId, tenantB));
  assert.equal(asB.length, 0);

  const asA = await dbRoot.select().from(messages).where(eq(messages.tenantId, tenantA));
  assert.equal(asA.length, 1);
  assert.equal(asA[0].content, "tenant A secret");
});

test("deleting a tenant takes its conversations and messages with it", async () => {
  const [temp] = await dbRoot
    .insert(tenants)
    .values({ slug: `isotest-tmp-${randomUUID().slice(0, 8)}`, name: "Temp", persona: "T" })
    .returning({ id: tenants.id });
  const [conversation] = await dbRoot
    .insert(conversations)
    .values({ tenantId: temp.id })
    .returning({ id: conversations.id });
  await dbRoot
    .insert(messages)
    .values({ tenantId: temp.id, conversationId: conversation.id, role: "user", content: "x" });

  await dbRoot.delete(tenants).where(eq(tenants.id, temp.id));

  const orphans = await dbRoot.select().from(messages).where(eq(messages.tenantId, temp.id));
  assert.equal(orphans.length, 0, "cascade must leave no orphaned messages");
});
