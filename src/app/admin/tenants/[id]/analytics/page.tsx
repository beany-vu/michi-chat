// Per-tenant analytics over the last 30 days, computed from data the platform already
// stores: messages (volume, latency, tokens, tool calls) and conversations (origin,
// country). "What visitors care about" is read from behavior, not guessed by a model:
// the tool mix says which capability they reach for, and the search_kb queries say it
// in the visitors' own words. Readable by staff, like conversations and usage.

import { and, desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { conversations, messages, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";

const WINDOW_DAYS = 30;

interface ToolLogEntry {
  name?: string;
  arguments?: string;
}

function bar(count: number, max: number): React.CSSProperties {
  return { width: `${max > 0 ? Math.max(2, Math.round((count / max) * 100)) : 2}%` };
}

function top<T extends string>(counts: Map<T, number>, n: number): [T, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { id } = await params;

  const [tenant] = await dbRoot.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) notFound();

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const recentMessages = await dbRoot
    .select({
      role: messages.role,
      createdAt: messages.createdAt,
      latencyMs: messages.latencyMs,
      tokensIn: messages.tokensIn,
      tokensOut: messages.tokensOut,
      toolCalls: messages.toolCalls,
    })
    .from(messages)
    .where(and(eq(messages.tenantId, id), gte(messages.createdAt, since)))
    .orderBy(desc(messages.createdAt))
    .limit(5000);

  const recentConversations = await dbRoot
    .select({ originHost: conversations.originHost, country: conversations.country })
    .from(conversations)
    .where(and(eq(conversations.tenantId, id), gte(conversations.startedAt, since)))
    .limit(5000);

  // --- aggregate in TS: tenant volumes are small, and jsonb spelunking in SQL is
  // harder to read than a loop.
  const perDay = new Map<string, number>();
  const perHour = new Array<number>(24).fill(0);
  const toolMix = new Map<string, number>();
  const kbQueries = new Map<string, number>();
  let latencyTotal = 0;
  let latencyCount = 0;
  let tokensInTotal = 0;
  let tokensOutTotal = 0;

  for (const message of recentMessages) {
    if (message.role === "user") {
      const day = message.createdAt.toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      perHour[message.createdAt.getHours()] += 1;
    } else {
      if (message.latencyMs !== null) {
        latencyTotal += message.latencyMs;
        latencyCount += 1;
      }
      tokensInTotal += message.tokensIn ?? 0;
      tokensOutTotal += message.tokensOut ?? 0;
      if (Array.isArray(message.toolCalls)) {
        for (const call of message.toolCalls as ToolLogEntry[]) {
          if (!call?.name) continue;
          toolMix.set(call.name, (toolMix.get(call.name) ?? 0) + 1);
          if (call.name === "search_kb" && call.arguments) {
            try {
              const query = (JSON.parse(call.arguments) as { query?: string }).query
                ?.trim()
                .toLowerCase();
              if (query) kbQueries.set(query, (kbQueries.get(query) ?? 0) + 1);
            } catch {
              /* model emitted non-JSON args; nothing to count */
            }
          }
        }
      }
    }
  }

  const origins = new Map<string, number>();
  const countries = new Map<string, number>();
  for (const conversation of recentConversations) {
    const host = conversation.originHost ?? "direct / unknown";
    origins.set(host, (origins.get(host) ?? 0) + 1);
    if (conversation.country) {
      countries.set(conversation.country, (countries.get(conversation.country) ?? 0) + 1);
    }
  }

  const days = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDay = Math.max(0, ...days.map(([, count]) => count));
  const maxHour = Math.max(0, ...perHour);
  const userMessageCount = recentMessages.filter((m) => m.role === "user").length;

  return (
    <>
      <div className="head">
        <h1>{tenant.name}: analytics</h1>
        <div className="head-links">
          <Link href={`/admin/tenants/${id}`}>Back to tenant</Link>
        </div>
      </div>

      <p className="note">
        Last {WINDOW_DAYS} days: {userMessageCount} visitor messages across{" "}
        {recentConversations.length} conversations
        {latencyCount > 0 && (
          <>
            {" "}
            · median-ish latency {(latencyTotal / latencyCount / 1000).toFixed(1)}s ·{" "}
            {tokensInTotal.toLocaleString()}→{tokensOutTotal.toLocaleString()} tokens
          </>
        )}
        . Countries appear once the platform runs behind Cloudflare (country only — IPs are
        never stored).
      </p>

      <section className="card">
        <h2>Messages per day</h2>
        {days.length === 0 && <p className="note">Nothing in the window yet.</p>}
        <div className="bars">
          {days.map(([day, count]) => (
            <div className="bar-row" key={day}>
              <span className="bar-label">{day.slice(5)}</span>
              <div className="bar-track">
                <div className="bar-fill" style={bar(count, maxDay)} />
              </div>
              <span className="bar-value">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>What visitors reach for</h2>
        <p className="note">Tool calls made while answering, last {WINDOW_DAYS} days.</p>
        <div className="bars">
          {top(toolMix, 8).map(([name, count]) => (
            <div className="bar-row" key={name}>
              <span className="bar-label">{name}</span>
              <div className="bar-track">
                <div className="bar-fill" style={bar(count, top(toolMix, 1)[0]?.[1] ?? 0)} />
              </div>
              <span className="bar-value">{count}</span>
            </div>
          ))}
          {toolMix.size === 0 && <p className="note">No tool calls in the window.</p>}
        </div>
      </section>

      <section className="card">
        <h2>What visitors ask about</h2>
        <p className="note">
          Knowledge-base searches, in the model&apos;s rephrasing of visitor questions. A
          frequent query with a weak answer is the next document to write.
        </p>
        {kbQueries.size === 0 ? (
          <p className="note">No knowledge-base searches in the window.</p>
        ) : (
          <ol className="query-list">
            {top(kbQueries, 12).map(([query, count]) => (
              <li key={query}>
                {query} <span className="pill">{count}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h2>Busy hours</h2>
        <div className="hour-strip">
          {perHour.map((count, hour) => (
            <div
              className="hour-cell"
              key={hour}
              title={`${hour}:00 — ${count} messages`}
              style={{ opacity: maxHour > 0 ? 0.15 + 0.85 * (count / maxHour) : 0.15 }}
            />
          ))}
        </div>
        <p className="note">Midnight → 23:00, server time. Darker = busier.</p>
      </section>

      <section className="card">
        <h2>Where conversations come from</h2>
        <div className="bars">
          {top(origins, 6).map(([host, count]) => (
            <div className="bar-row" key={host}>
              <span className="bar-label">{host}</span>
              <div className="bar-track">
                <div className="bar-fill" style={bar(count, top(origins, 1)[0]?.[1] ?? 0)} />
              </div>
              <span className="bar-value">{count}</span>
            </div>
          ))}
        </div>
        {countries.size > 0 && (
          <p className="note">
            Countries:{" "}
            {top(countries, 10)
              .map(([code, count]) => `${code} ${count}`)
              .join(" · ")}
          </p>
        )}
      </section>
    </>
  );
}
