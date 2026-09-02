// The gap report: every assistant turn that admitted not knowing, with the visitor
// question that caused it. This page is the knowledge base's to-do list - the loop is
// read a row → add the missing fact on that tenant's Facts & knowledge page → the next
// visitor gets a real answer. Detection is a read-time heuristic (src/lib/unanswered.ts),
// so it works on all history with no schema change.

import { sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { isAuthenticated } from "@/lib/admin-auth";
import { FRIENDLY_ERROR } from "@/lib/moderation";
import { UNANSWERED_SQL_REGEX } from "@/lib/unanswered";
import { LocalTime } from "../LocalTime";

const WINDOW_DAYS = 30;
const MAX_ROWS = 100;

interface GapRow {
  message_id: string;
  conversation_id: string;
  tenant_name: string;
  tenant_id: string;
  created_at: string;
  question: string | null;
  answer: string;
}

export default async function UnansweredPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  // The preceding user turn is the interesting half: that's the question to answer in
  // the KB. Correlated subquery keeps this one round-trip.
  // postgres.js returns the row array directly (no .rows wrapper).
  const rows = (await dbRoot.execute(sql`
    select m.id as message_id,
           m.conversation_id,
           m.created_at,
           t.name as tenant_name,
           t.id as tenant_id,
           left(m.content, 400) as answer,
           (select left(q.content, 300) from messages q
             where q.conversation_id = m.conversation_id and q.role = 'user'
               and q.created_at <= m.created_at
             order by q.created_at desc limit 1) as question
    from messages m
    join tenants t on t.id = m.tenant_id
    where m.role = 'assistant'
      and m.created_at > now() - interval '${sql.raw(String(WINDOW_DAYS))} days'
      and (m.content ~* ${UNANSWERED_SQL_REGEX} or m.content = ${FRIENDLY_ERROR})
    order by m.created_at desc
    limit ${MAX_ROWS}
  `)) as unknown as GapRow[];

  return (
    <>
      <div className="head">
        <h1>Unanswered</h1>
      </div>

      <p className="note">
        Turns from the last {WINDOW_DAYS} days where the assistant admitted it did not
        know. Each row is a fact worth adding: open the tenant&apos;s Facts &amp;
        knowledge page, write a short <code>##</code> section that answers the question,
        and the next visitor gets a real answer. Polite scope refusals (off-topic,
        prices, ownership) are working as designed and are not listed.
      </p>

      {rows.length === 0 ? (
        <p className="note">Nothing in the window. The knowledge base is keeping up.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Tenant</th>
              <th>Visitor asked</th>
              <th>The bot said</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.message_id}>
                <td>
                  <LocalTime iso={new Date(row.created_at).toISOString()} />
                </td>
                <td>{row.tenant_name}</td>
                <td>{row.question ?? "(no question stored)"}</td>
                <td className="gap-answer">{row.answer}</td>
                <td>
                  <Link className="row-action" href={`/admin/conversations/${row.conversation_id}`}>
                    View
                  </Link>{" "}
                  <Link className="row-action" href={`/admin/tenants/${row.tenant_id}/kb`}>
                    Add fact
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
