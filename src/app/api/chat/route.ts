// POST /api/chat — one chat turn as an SSE stream: `status` (thinking) → `tool` (live,
// as each tool starts) → `delta` (answer text) → `done` (ids + usage). The tool loop is
// hand-rolled and visible: send tools JSON, execute what the model asks for, resend,
// repeat until it answers in plain text. ~40 lines, no framework magic.
//
// Multi-tenant: the caller presents a public embed key, which resolves to a tenant whose
// persona, tools and model come from the database. See src/lib/tenant.ts.

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { forTenant } from "@/db/tenant-db";
import { buildSystemPrompt, wrapToolResult } from "@/lib/prompt";
import { BAIT_STRIKES_PER_HOUR, BAIT_WINDOW_SECONDS, looksLikeBait } from "@/lib/guardrail";
import { lookupCachedAnswer, storeCachedAnswer } from "@/lib/rag/answer-cache";
import { isRateLimited } from "@/lib/rate-limit";
import { notifySlack } from "@/lib/slack";
import { corsHeaders, corsJson, isOriginRegistered, normalizeOrigin, resolveTenant } from "@/lib/tenant";
import { buildTenantTools } from "@/lib/tools";

const MAX_ROUNDS = 6;
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

/**
 * Preflight. It carries no embed key, only an Origin, so it can only approve the origin;
 * the POST enforces that the key and the origin belong to the SAME tenant.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = normalizeOrigin(request.headers.get("origin") ?? "");
  if (!origin || !(await isOriginRegistered(origin))) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-embed-key, x-michi-session",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: NextRequest) {
  // Everything up to the ReadableStream can still fail with a normal status code. Once we
  // return the stream we have committed to a 200, so all validation belongs here.
  const resolution = await resolveTenant(request);
  if (!resolution.ok) {
    const origin = resolution.corsOk ? normalizeOrigin(request.headers.get("origin") ?? "") : null;
    return corsJson({ error: resolution.error }, resolution.status, origin);
  }
  const { tenant, apiKeyId, sessionId, issuedSessionToken, origin } = resolution;
  const db = forTenant(tenant.id);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return corsJson({ error: "request body is too large" }, 413, origin);
  }

  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "invalid JSON body" }, 400, origin);
  }

  const userText = typeof body.message === "string" ? body.message.trim() : "";
  if (!userText) return corsJson({ error: "message is required" }, 400, origin);
  if (userText.length > MAX_MESSAGE_CHARS) {
    return corsJson(
      { error: `message must be ${MAX_MESSAGE_CHARS} characters or fewer` },
      413,
      origin,
    );
  }

  // Bait circuit breaker: explicit injection phrases earn the session strikes; past the
  // threshold the session is refused for the rest of the window. The model's preamble
  // handles the polite decline of the first few — this stops the persistent ones.
  if (looksLikeBait(userText)) {
    const overStruck = await isRateLimited({
      key: `strike:${sessionId}`,
      windowSeconds: BAIT_WINDOW_SECONDS,
      max: BAIT_STRIKES_PER_HOUR,
    });
    if (overStruck) {
      return corsJson(
        { error: "This chat only answers questions about the business. Please try again later." },
        429,
        origin,
      );
    }
  }

  // The daily cap is the only control that holds against someone who has the embed key,
  // since the key is public and Origin is forgeable off-browser. It protects the bill.
  const storing = tenant.storeConversations;
  if (storing) {
    const usedToday = await db.userMessagesToday(tenant.timezone);
    if (usedToday >= tenant.dailyMessageCap) {
      return corsJson({ error: "daily message limit reached" }, 429, origin);
    }
    // This turn consumes the last slot of the day, and rejected turns are never stored,
    // so this condition is true exactly once per day: the natural "notify once" point.
    if (usedToday + 1 === tenant.dailyMessageCap) {
      void notifySlack(
        tenant.slackWebhookUrl,
        `:warning: ${tenant.name}: daily message cap (${tenant.dailyMessageCap}) reached. The bot will decline further messages until midnight.`,
      );
    }
  } else if (
    // Privacy mode stores no message rows, so the cap counts in rate_buckets instead.
    // Same number, different ledger; the bill stays protected either way.
    await isRateLimited({
      key: `msgs:${tenant.id}`,
      windowSeconds: 86_400,
      max: tenant.dailyMessageCap,
    })
  ) {
    return corsJson({ error: "daily message limit reached" }, 429, origin);
  }

  // A malformed id would reach a uuid column and make Postgres throw, so treat anything
  // that is not a uuid as "no conversation" rather than as an error.
  const requestedId =
    typeof body.conversationId === "string" && UUID_PATTERN.test(body.conversationId)
      ? body.conversationId
      : null;

  let conversation: Awaited<ReturnType<typeof db.createConversation>> | null = null;
  let history: Awaited<ReturnType<typeof db.recentMessages>> = [];
  if (storing) {
    try {
      // Scoped by tenant AND session, both server-controlled, so a leaked conversationId
      // is not on its own enough to resume someone else's thread.
      const existing = requestedId ? await db.findConversation(requestedId, sessionId) : null;
      // Country only, from Cloudflare's edge when the platform runs behind it. Never
      // the IP: country-level is analytics, an IP at rest is a liability.
      const cfCountry = request.headers.get("cf-ipcountry")?.toUpperCase() ?? null;
      conversation =
        existing ??
        (await db.createConversation({
          sessionId,
          apiKeyId,
          originHost: origin,
          country: cfCountry && /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : null,
        }));
      if (!existing) {
        // Fire-and-forget by design: notifySlack never throws and never blocks the turn.
        // Only a snippet of the first message goes out; the transcript stays in the DB.
        void notifySlack(
          tenant.slackWebhookUrl,
          `:speech_balloon: New conversation for ${tenant.name}${origin ? ` from ${origin}` : ""}: "${userText.slice(0, 140)}"`,
        );
      }

      history = await db.recentMessages(conversation.id);

      // Persist the user turn BEFORE the LLM call — a crash cannot lose what was asked.
      await db.appendMessage({
        conversationId: conversation.id,
        role: "user",
        content: userText,
      });
    } catch (error) {
      console.error("chat preamble failed", error);
      return corsJson({ error: "Chat is unavailable right now." }, 503, origin);
    }
  }
  // Privacy mode: no rows at all, which also means no multi-turn memory. That trade-off
  // is stated on the admin form where the switch lives.

  // Semantic cache, first messages only (see answer-cache.ts for the full rules). A hit
  // skips the model entirely; a miss reuses this embedding when storing the new answer.
  const cacheEligible = storing && history.length === 0;
  let cachedAnswer: string | null = null;
  let cachedModel: string | null = null;
  let questionEmbedding: number[] | null = null;
  if (cacheEligible) {
    try {
      const { hit, embedding } = await lookupCachedAnswer(tenant.id, userText);
      questionEmbedding = embedding;
      if (hit) {
        cachedAnswer = hit.answer;
        cachedModel = hit.model;
      }
    } catch (error) {
      // The cache must never break a turn; a cold embedder just means the slow path.
      console.warn("answer cache lookup failed", error);
    }
  }

  const tools = buildTenantTools(tenant.toolConfig, tenant.id);
  const model = tenant.model ?? process.env.CHAT_MODEL ?? "michi";

  const turn: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(tenant.persona) },
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

        // Cache hit: same events, same persistence, no model call. The visitor cannot
        // tell except by the speed; the transcript records which model originally wrote it.
        if (cachedAnswer !== null) {
          for (let i = 0; i < cachedAnswer.length; i += 48) {
            emit("delta", { text: cachedAnswer.slice(i, i + 48) });
          }
          const latencyMs = Date.now() - started;
          if (conversation) {
            await db.appendMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: cachedAnswer,
              model: cachedModel ?? model,
              tokensIn: 0,
              tokensOut: 0,
              latencyMs,
            });
            await db.touchConversation(conversation.id);
          }
          emit("done", {
            conversationId: conversation?.id ?? null,
            sessionToken: issuedSessionToken,
            cached: true,
            usage: { inTokens: 0, outTokens: 0 },
            latencyMs,
          });
          return;
        }

        // The loop: while the model asks for tools, run them and resend; the first
        // plain-text response is the answer.
        let answer = "";
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const completion = await openai.chat.completions.create({
            model,
            messages: turn,
            ...(tools.definitions.length > 0 ? { tools: tools.definitions } : {}),
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
            emit("tool", {
              name: call.function.name,
              label: tools.labelFor(call.function.name),
              arguments: call.function.arguments,
            });
            const result = await tools.execute(call.function.name, call.function.arguments);
            toolLog.push({
              name: call.function.name,
              arguments: call.function.arguments,
              // Cap what we store too: this column holds full upstream response bodies.
              result: result.slice(0, 8192),
            });
            // Tool output stays in a role:"tool" message and is never folded into the
            // system prompt. That separation is the one structural defence against a
            // compromised upstream injecting instructions.
            turn.push({ role: "tool", tool_call_id: call.id, content: wrapToolResult(result) });
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
        if (conversation) {
          await db.appendMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: answer,
            toolCalls: toolLog.length > 0 ? toolLog : null,
            model,
            tokensIn,
            tokensOut,
            latencyMs,
          });
          await db.touchConversation(conversation.id);
        }

        // Feed the semantic cache, but never with the gave-up fallback.
        if (cacheEligible && questionEmbedding && !answer.startsWith("Sorry, I could not")) {
          void storeCachedAnswer({
            tenantId: tenant.id,
            question: userText,
            embedding: questionEmbedding,
            answer,
            model,
          });
        }

        emit("done", {
          conversationId: conversation?.id ?? null,
          // Only present on the turn that minted it; the client stores it and replays it.
          sessionToken: issuedSessionToken,
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
      ...corsHeaders(origin),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      // Stops nginx and friends buffering the whole stream into one blob.
      "X-Accel-Buffering": "no",
    },
  });
}
