// The answer-cache inspector. Exists because of a real incident: a cached "what's
// coming up?" answer kept serving February events as upcoming for most of a day
// (2026-08-31). The cache self-heals (24h TTL, wiped on any knowledge/settings edit),
// but the operator needs to SEE what's being served instantly and evict one bad row -
// or all of them - without re-saving the tenant.

import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { answerCache, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";
import { clearTenantCacheAction, deleteCachedAnswerAction } from "../../../actions";
import { LocalTime } from "../../../LocalTime";

export default async function CachePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { id } = await params;

  const [tenant] = await dbRoot
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!tenant) notFound();

  const rows = await dbRoot
    .select({
      id: answerCache.id,
      question: answerCache.question,
      answer: answerCache.answer,
      model: answerCache.model,
      hits: answerCache.hits,
      createdAt: answerCache.createdAt,
    })
    .from(answerCache)
    .where(eq(answerCache.tenantId, id))
    .orderBy(desc(answerCache.hits), desc(answerCache.createdAt))
    .limit(200);

  return (
    <>
      <div className="head">
        <h1>{tenant.name}: answer cache</h1>
        <div className="head-links">
          {rows.length > 0 && (
            <form action={clearTenantCacheAction.bind(null, tenant.id)}>
              <button type="submit" className="ghost">
                Clear all ({rows.length})
              </button>
            </form>
          )}
          <Link href={`/admin/tenants/${tenant.id}`}>Back to tenant</Link>
        </div>
      </div>

      <p className="note">
        These answers are served instantly (and for free) when a new conversation opens
        with a close paraphrase of the question. Rows expire after 24 hours and the whole
        cache clears itself whenever knowledge or settings change - but if an answer here
        is stale or wrong, delete it and the next visitor gets a fresh one. High-hit rows
        are also a menu of what visitors ask most.
      </p>

      {rows.length === 0 ? (
        <p className="note">Empty right now. It fills as visitors open conversations.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Cached answer</th>
              <th className="num">Hits</th>
              <th>Cached</th>
              <th>Model</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.question}</td>
                <td className="gap-answer">{row.answer.slice(0, 240)}</td>
                <td className="num">{row.hits}</td>
                <td>
                  <LocalTime iso={row.createdAt.toISOString()} />
                </td>
                <td>{row.model ?? "-"}</td>
                <td>
                  <form
                    action={deleteCachedAnswerAction.bind(null, tenant.id, row.id)}
                    style={{ display: "inline" }}
                  >
                    <button type="submit" className="ghost">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
