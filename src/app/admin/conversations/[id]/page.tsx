// One transcript.
//
// IMPORTANT: message content is rendered as PLAIN TEXT, never markdown and never HTML.
// The visitor-facing widget renders markdown, which is fine there. Here the reader holds
// the session that controls the whole platform, so a markdown image in a poisoned tool
// result would exfiltrate transcripts from the operator's own browser. Keep it <pre>.

import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { conversations, messages, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";

export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { id } = await params;

  const [conversation] = await dbRoot
    .select({
      id: conversations.id,
      startedAt: conversations.startedAt,
      originHost: conversations.originHost,
      tenantName: tenants.name,
      tenantId: tenants.id,
    })
    .from(conversations)
    .innerJoin(tenants, eq(tenants.id, conversations.tenantId))
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conversation) notFound();

  const turns = await dbRoot
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  return (
    <>
      <div className="head">
        <h1>{conversation.tenantName}</h1>
        <div className="head-links">
          <span>{conversation.originHost ?? "direct"}</span>
          <Link href="/admin/conversations">Back</Link>
        </div>
      </div>

      <div className="transcript">
        {turns.map((turn) => (
          <article key={turn.id} className={`turn ${turn.role}`}>
            <header>
              <strong>{turn.role}</strong>
              <span>{turn.createdAt.toLocaleString()}</span>
              {turn.latencyMs !== null && (
                <span>
                  {(turn.latencyMs / 1000).toFixed(1)}s · {turn.tokensIn}→{turn.tokensOut} tokens
                </span>
              )}
              {turn.model && <span>{turn.model}</span>}
            </header>
            <pre>{turn.content}</pre>
            {turn.toolCalls != null && (
              <details>
                <summary>tool calls</summary>
                <pre>{JSON.stringify(turn.toolCalls, null, 2)}</pre>
              </details>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
