import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { conversations, messages, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";

const PAGE_SIZE = 50;

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { tenant: tenantSlug } = await searchParams;

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
      startedAt: conversations.startedAt,
      lastMessageAt: conversations.lastMessageAt,
      messageCount: sql<number>`(
        select count(*)::int from ${messages} m where m.conversation_id = conversations.id
      )`,
    })
    .from(conversations)
    .innerJoin(tenants, eq(tenants.id, conversations.tenantId))
    .where(tenantSlug ? eq(tenants.slug, tenantSlug) : undefined)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(PAGE_SIZE);

  return (
    <>
      <div className="head">
        <h1>Conversations</h1>
        <div className="filters">
          <Link
            className={`filter${!tenantSlug ? " filter-active" : ""}`}
            href="/admin/conversations"
          >
            All
          </Link>
          {allTenants.map((t) => (
            <Link
              key={t.slug}
              className={`filter${tenantSlug === t.slug ? " filter-active" : ""}`}
              href={`/admin/conversations?tenant=${t.slug}`}
            >
              {t.name}
            </Link>
          ))}
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
              <td>{row.tenantName}</td>
              <td>{row.startedAt.toLocaleString()}</td>
              <td>{row.lastMessageAt.toLocaleString()}</td>
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
      {rows.length === PAGE_SIZE && <p className="note">Showing the {PAGE_SIZE} most recent.</p>}
    </>
  );
}
