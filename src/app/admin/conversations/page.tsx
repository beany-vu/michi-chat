import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { conversations, messages, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";
import { LocalTime } from "../LocalTime";

const PAGE_SIZE = 50;

/** Query-string helper so every chip and pager link preserves the other filters. */
function href(params: { tenant?: string; flagged?: boolean; page?: number }) {
  const query = new URLSearchParams();
  if (params.tenant) query.set("tenant", params.tenant);
  if (params.flagged) query.set("flagged", "1");
  if (params.page && params.page > 1) query.set("page", String(params.page));
  const s = query.toString();
  return s ? `/admin/conversations?${s}` : "/admin/conversations";
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; flagged?: string; page?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const params = await searchParams;
  const tenantSlug = params.tenant;
  const flaggedOnly = params.flagged === "1";
  const page = Math.max(1, Number(params.page) || 1);

  const allTenants = await dbRoot
    .select({ slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .orderBy(tenants.name);

  const rows = await dbRoot
    .select({
      id: conversations.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      originHost: conversations.originHost,
      country: conversations.country,
      flaggedAt: conversations.flaggedAt,
      flagReason: conversations.flagReason,
      startedAt: conversations.startedAt,
      lastMessageAt: conversations.lastMessageAt,
      messageCount: sql<number>`(
        select count(*)::int from ${messages} m where m.conversation_id = conversations.id
      )`,
    })
    .from(conversations)
    .innerJoin(tenants, eq(tenants.id, conversations.tenantId))
    .where(
      and(
        tenantSlug ? eq(tenants.slug, tenantSlug) : undefined,
        flaggedOnly ? isNotNull(conversations.flaggedAt) : undefined,
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    // One extra row is the cheapest "is there a next page" check.
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;
  if (hasNext) rows.pop();

  return (
    <>
      <div className="head">
        <h1>Conversations</h1>
        <div className="filters">
          <Link
            className={`filter${!tenantSlug ? " filter-active" : ""}`}
            href={href({ flagged: flaggedOnly })}
          >
            All
          </Link>
          {allTenants.map((t) => (
            <Link
              key={t.slug}
              className={`filter${tenantSlug === t.slug ? " filter-active" : ""}`}
              href={href({ tenant: t.slug, flagged: flaggedOnly })}
            >
              {t.name}
            </Link>
          ))}
          <Link
            className={`filter${flaggedOnly ? " filter-active" : ""}`}
            href={href({ tenant: tenantSlug, flagged: !flaggedOnly })}
          >
            🚩 Flagged
          </Link>
        </div>
      </div>

      <p className="note">
        Every stored chat, newest first; use the chips to see one tenant. Transcripts are
        shown as plain text on purpose (nothing a visitor types can run in your browser).
        Reading these weekly is how the bot gets better: when you spot a bad answer, add
        the missing fact on that tenant&apos;s Facts &amp; knowledge page.
      </p>
      <p className="note">
        Conversations are kept only to improve the service. If a transcript contains personal
        or sensitive information, consider deleting it (open it and use Delete). Location is
        country-level only, from the network edge; visitor IP addresses are never stored.
      </p>

      <table>
        <thead>
          <tr>
            <th aria-label="Flagged" />
            <th>Tenant</th>
            <th>Started</th>
            <th>Last message</th>
            <th className="num">Messages</th>
            <th>Country</th>
            <th>Origin</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {/* The reason rides on hover; "auto: …" comes from the probe breaker,
                  "manual" from the flag button on the transcript. */}
              <td title={row.flagReason ?? undefined}>{row.flaggedAt ? "🚩" : ""}</td>
              <td>{row.tenantName}</td>
              <td><LocalTime iso={row.startedAt.toISOString()} /></td>
              <td><LocalTime iso={row.lastMessageAt.toISOString()} /></td>
              <td className="num">{row.messageCount}</td>
              <td>{row.country ?? "-"}</td>
              <td>{row.originHost ?? "direct"}</td>
              <td>
                <Link className="row-action" href={`/admin/conversations/${row.id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(hasNext || page > 1) && (
        <p className="note pager">
          {page > 1 && (
            <Link href={href({ tenant: tenantSlug, flagged: flaggedOnly, page: page - 1 })}>
              ← Newer
            </Link>
          )}
          <span> Page {page} </span>
          {hasNext && (
            <Link href={href({ tenant: tenantSlug, flagged: flaggedOnly, page: page + 1 })}>
              Older →
            </Link>
          )}
        </p>
      )}
    </>
  );
}
