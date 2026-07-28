// Usage rollup, per tenant per day.
//
// This is the reason messages carries tokensIn/tokensOut/latencyMs: LiteLLM's own spend
// logs attribute to a virtual key, which would give coarser data than this and would
// require giving LiteLLM a database. Per-message columns cost nothing and are strictly
// more granular.

import { desc, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { messages, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";
import { estimateCost } from "@/lib/pricing";

export default async function UsagePage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const rows = await dbRoot
    .select({
      day: sql<string>`date_trunc('day', ${messages.createdAt})::date::text`,
      tenantName: tenants.name,
      model: sql<string | null>`max(${messages.model})`,
      turns: sql<number>`count(*) filter (where ${messages.role} = 'user')::int`,
      tokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)::int`,
      avgLatency: sql<number>`coalesce(avg(${messages.latencyMs}), 0)::int`,
    })
    .from(messages)
    .innerJoin(tenants, sql`${tenants.id} = ${messages.tenantId}`)
    .where(sql`${messages.createdAt} > now() - interval '30 days'`)
    .groupBy(sql`date_trunc('day', ${messages.createdAt})`, tenants.name)
    .orderBy(desc(sql`date_trunc('day', ${messages.createdAt})`), tenants.name);

  return (
    <>
      <div className="head">
        <h1>Usage, last 30 days</h1>
      </div>

      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Tenant</th>
            <th className="num">Turns</th>
            <th className="num">Tokens in</th>
            <th className="num">Tokens out</th>
            <th className="num">Avg latency</th>
            <th className="num">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.day}-${row.tenantName}`}>
              <td>{row.day}</td>
              <td>{row.tenantName}</td>
              <td className="num">{row.turns}</td>
              <td className="num">{row.tokensIn.toLocaleString()}</td>
              <td className="num">{row.tokensOut.toLocaleString()}</td>
              <td className="num">{(row.avgLatency / 1000).toFixed(1)}s</td>
              <td className="num">
                ${estimateCost(row.model, row.tokensIn, row.tokensOut).toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="note">No traffic yet.</p>}
      <p className="note">
        Cost is zero while LiteLLM routes to a local Ollama. It comes from
        <code> src/lib/pricing.ts</code>, keyed by model alias.
      </p>
    </>
  );
}
