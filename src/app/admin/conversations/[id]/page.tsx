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
import { getAdminSession } from "@/lib/admin-auth";
import { deleteConversationAction } from "../../actions";
import { LocalTime } from "../../LocalTime";

// Tool results are stored as JSON *strings* inside the toolCalls JSON; dumped raw they
// render as one endless escaped line. Decode when possible, show verbatim when not.
function prettyJson(value: string | undefined): string {
  if (!value) return "(no result)";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
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
          {session.role === "owner" && (
            <>
              <a href={`/admin/export?conversation=${conversation.id}`}>Export JSON</a>
              <form action={deleteConversationAction.bind(null, conversation.id)}>
                <button type="submit" className="ghost">
                  Delete
                </button>
              </form>
            </>
          )}
          <Link href="/admin/conversations">Back</Link>
        </div>
      </div>

      {/* Chat-box layout mirroring the widget: visitor right, assistant left, so the
          operator reads the conversation the way the visitor experienced it. */}
      <div className="transcript">
        {turns.map((turn) => (
          <article key={turn.id} className={`turn ${turn.role}`}>
            <header>
              <strong>{turn.role === "user" ? "visitor" : "assistant"}</strong>
              {/* Cache hits persist with 0->0 tokens (no model ran); live answers always
                  burn tokens. That signature is why cached turns have no debug block. */}
              {turn.role === "assistant" && turn.tokensIn === 0 && turn.tokensOut === 0 && (
                <span className="pill">cached</span>
              )}
              <span>
                <LocalTime iso={turn.createdAt.toISOString()} />
              </span>
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
                <summary>
                  debug: tool calls &amp; results
                  {Array.isArray(turn.toolCalls) ? ` (${turn.toolCalls.length})` : ""}
                </summary>
                {Array.isArray(turn.toolCalls) ? (
                  turn.toolCalls.map((call, i) => {
                    const c = call as { name?: string; arguments?: string; result?: string };
                    return (
                      <div key={i} className="tool-call">
                        <p className="tool-call-name">
                          {c.name ?? "unknown"}
                          {c.arguments && c.arguments !== "{}" ? `  ${c.arguments}` : "()"}
                        </p>
                        <pre>{prettyJson(c.result)}</pre>
                      </div>
                    );
                  })
                ) : (
                  <pre>{JSON.stringify(turn.toolCalls, null, 2)}</pre>
                )}
              </details>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
