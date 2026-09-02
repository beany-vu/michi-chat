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
import { deleteConversationAction, setConversationFlagAction } from "../../actions";
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

/**
 * Which path produced an assistant turn. Every answer falls into exactly one of four
 * cases, and the stored row is enough to tell them apart; the pill + tooltip exist so a
 * transcript can be read (and learned from) without knowing the chat route's code.
 *
 *   cached     0→0 tokens: replayed from the semantic answer cache, no model ran.
 *   guardrail  no model, no tokens: a fixed refusal from the probe breaker, no model ran.
 *   used tools model ran AND called tools; the raw calls are in the debug block.
 *   model only model ran and answered from its instructions alone, nothing looked up.
 */
function answerPath(turn: {
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  toolCalls: unknown;
}): { label: string; explain: string } {
  if (turn.tokensIn === 0 && turn.tokensOut === 0) {
    return {
      label: "cached",
      explain:
        "Replayed from the semantic answer cache: an earlier conversation already asked this (or a close paraphrase of it), so the stored answer was served instantly. No model ran and no tools were called, which is why there is no token count and no debug block.",
    };
  }
  if (turn.model === "error") {
    return {
      label: "failed",
      explain:
        "The model call failed on this turn: the visitor saw an error bubble and got no answer. This marker exists so the gap is visible here instead of a lone visitor message. If these cluster, check the provider or LiteLLM logs.",
    };
  }
  if (turn.model === null && turn.tokensIn === null) {
    return {
      label: "guardrail",
      explain:
        "A fixed, hard-coded reply from the guardrail: the message matched a prompt-injection bait pattern or was a bare /command. The model never ran, so there is nothing to debug and no tokens were spent. These conversations are auto-flagged.",
    };
  }
  if (turn.toolCalls != null) {
    const names = Array.isArray(turn.toolCalls)
      ? (turn.toolCalls as { name?: string }[]).map((c) => c.name ?? "unknown").join(", ")
      : "";
    return {
      label: names ? `used tools: ${names}` : "used tools",
      explain:
        "The model decided it needed live data before answering and called the listed tools; the exact calls and raw results are in the debug block below. search_kb is the knowledge-base (RAG) lookup; provider_error means the model's raw reply was an upstream error and the visitor got a friendly line instead.",
    };
  }
  return {
    label: "model only",
    explain:
      "The model answered straight from its instructions (platform rules + persona + owner rules) and the conversation so far. It decided nothing needed looking up, so there are no tool calls, no knowledge-base search, and no debug block. The token count proves a model really ran.",
  };
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
      flaggedAt: conversations.flaggedAt,
      flagReason: conversations.flagReason,
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
          {/* Flagging is staff-reachable on purpose: it is conversation reading, not
              administration. "auto: …" flags come from the probe breaker in the chat
              route; unflagging one is how you mark it reviewed. */}
          <form
            action={setConversationFlagAction.bind(null, conversation.id, !conversation.flaggedAt)}
          >
            <button type="submit" className="ghost" title={conversation.flagReason ?? undefined}>
              {conversation.flaggedAt ? "🚩 Unflag" : "Flag as malicious"}
            </button>
          </form>
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

      <p className="note">
        Every assistant turn carries a label for how the answer was produced, one of four
        cases: <strong>cached</strong> (replayed from the answer cache, no model),{" "}
        <strong>guardrail</strong> (fixed refusal, no model), <strong>used tools</strong>{" "}
        (the model fetched live data or searched the knowledge base first, see its debug
        block), or <strong>model only</strong> (answered from its instructions alone,
        nothing looked up). Hover a label for the full explanation.
      </p>

      {/* Chat-box layout mirroring the widget: visitor right, assistant left, so the
          operator reads the conversation the way the visitor experienced it. */}
      <div className="transcript">
        {turns.map((turn) => (
          <article key={turn.id} className={`turn ${turn.role}`}>
            <header>
              <strong>{turn.role === "user" ? "visitor" : "assistant"}</strong>
              {turn.role === "assistant" &&
                (() => {
                  const path = answerPath(turn);
                  return (
                    <span className="pill" title={path.explain}>
                      {path.label}
                    </span>
                  );
                })()}
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
