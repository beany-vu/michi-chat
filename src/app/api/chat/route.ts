// POST /api/chat — one chat turn as an SSE stream: `status` (thinking) → `tool` (live,
// as each tool starts) → `delta` (answer text) → `done` (ids + usage). The tool loop is
// hand-rolled and visible: send tools JSON, execute what the model asks for, resend,
// repeat until it answers in plain text. ~40 lines, no framework magic.

import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { executeTool, PERSONA, toolDefinitions } from "@/lib/tools";

const MAX_ROUNDS = 6;
const HISTORY_WINDOW = 12;
// App Router route handlers have NO built-in body limit, and the user turn is written to
// the DB before the model ever sees it. History is replayed every turn, so one oversized
// message would poison every later turn in that conversation. Cap it at both ends.
const MAX_MESSAGE_CHARS = 2000;
const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const openai = new OpenAI({
  baseURL: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
  apiKey: process.env.LITELLM_API_KEY ?? "sk-michi-dev",
});

export async function POST(request: NextRequest) {
  // Everything up to the ReadableStream can still fail with a normal status code. Once we
  // return the stream we have committed to a 200, so all validation belongs here.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "request body is too large" }, { status: 413 });
  }

  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const userText = typeof body.message === "string" ? body.message.trim() : "";
  if (!userText) return Response.json({ error: "message is required" }, { status: 400 });
  if (userText.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      { error: `message must be ${MAX_MESSAGE_CHARS} characters or fewer` },
      { status: 413 },
    );
  }

  // A malformed id would reach a uuid column and make Postgres throw, so treat anything
  // that is not a uuid as "no conversation" rather than as an error.
  const requestedId =
    typeof body.conversationId === "string" && UUID_PATTERN.test(body.conversationId)
      ? body.conversationId
      : null;

  const anonId = request.headers.get("x-anon-id") ?? crypto.randomUUID().replaceAll("-", "");

  let conversation: typeof conversations.$inferSelect;
  let history: (typeof messages.$inferSelect)[];
  try {
    // Load or start the conversation; the anon id must match (one visitor cannot
    // continue another visitor's thread).
    const existing = requestedId
      ? ((await db.query.conversations.findFirst({
          where: (c, { and: allOf, eq: equals }) =>
            allOf(equals(c.id, requestedId), equals(c.anonId, anonId)),
        })) ?? null)
      : null;
    conversation = existing ?? (await db.insert(conversations).values({ anonId }).returning())[0];

    // Memory is rebuilt, not remembered: newest N user/assistant turns, chronological.
    history = (
      await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(HISTORY_WINDOW)
    ).reverse();

    // Persist the user turn BEFORE the LLM call — a crash cannot lose what was asked.
    await db.insert(messages).values({
      conversationId: conversation.id,
      role: "user",
      content: userText,
    });
  } catch (error) {
    console.error("chat preamble failed", error);
    return Response.json({ error: "Chat is unavailable right now." }, { status: 503 });
  }

  const turn: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: PERSONA },
    ...history.map((m) => ({ role: m.role, content: m.content }) as const),
    { role: "user", content: userText },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, payload: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));

      const started = Date.now();
      let tokensIn = 0;
      let tokensOut = 0;
      const toolLog: { name: string; arguments: string; result: string }[] = [];

      try {
        emit("status", { state: "thinking" });

        // The loop: while the model asks for tools, run them and resend; the first
        // plain-text response is the answer.
        let answer = "";
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const completion = await openai.chat.completions.create({
            model: process.env.CHAT_MODEL ?? "michi",
            messages: turn,
            tools: toolDefinitions,
          });
          tokensIn += completion.usage?.prompt_tokens ?? 0;
          tokensOut += completion.usage?.completion_tokens ?? 0;

          const choice = completion.choices[0].message;
          const toolCalls = (choice.tool_calls ?? []).filter((c) => c.type === "function");
          if (toolCalls.length === 0) {
            answer = choice.content ?? "";
            break;
          }

          turn.push(choice);
          for (const call of toolCalls) {
            emit("tool", { name: call.function.name, arguments: call.function.arguments });
            const result = await executeTool(call.function.name, call.function.arguments);
            toolLog.push({ name: call.function.name, arguments: call.function.arguments, result });
            turn.push({ role: "tool", tool_call_id: call.id, content: result });
          }
        }

        // If every round came back asking for more tools we fall out of the loop with
        // nothing to say. Without this the visitor just gets an empty bubble.
        if (!answer.trim()) {
          answer =
            "Sorry, I could not work that one out just now. Could you try asking it a different way?";
        }

        // House style, enforced in code: models follow "no dashes" unreliably.
        answer = answer
          .replaceAll("—", ", ")
          .replaceAll(" – ", ", ")
          .replaceAll("–", "-");

        for (let i = 0; i < answer.length; i += 48) {
          emit("delta", { text: answer.slice(i, i + 48) });
        }

        const latencyMs = Date.now() - started;
        await db.insert(messages).values({
          conversationId: conversation.id,
          role: "assistant",
          content: answer,
          toolCalls: toolLog.length > 0 ? toolLog : null,
          model: process.env.CHAT_MODEL ?? "michi",
          tokensIn,
          tokensOut,
          latencyMs,
        });
        await db
          .update(conversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(conversations.id, conversation.id));

        emit("done", {
          conversationId: conversation.id,
          anonId,
          usage: { inTokens: tokensIn, outTokens: tokensOut },
          latencyMs,
        });
      } catch (error) {
        console.error("chat turn failed", error);
        emit("error", { message: "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
