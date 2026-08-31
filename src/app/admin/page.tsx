// Tenant list. Server component, one query with correlated subqueries for the counts.

import { sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { apiKeys, conversations, messages, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";
import { NewTenantForm } from "./NewTenantForm";
import { TenantImport } from "./TenantImport";
import { LocalTime } from "./LocalTime";

export default async function AdminHome() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const rows = await dbRoot
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      cap: tenants.dailyMessageCap,
      messages7d: sql<number>`(
        select count(*)::int from ${messages} m
        where m.tenant_id = tenants.id and m.created_at > now() - interval '7 days'
      )`,
      keys: sql<number>`(
        select count(*)::int from ${apiKeys} k
        where k.tenant_id = tenants.id and k.revoked_at is null
      )`,
      lastActivity: sql<string | null>`(
        select max(c.last_message_at) from ${conversations} c where c.tenant_id = tenants.id
      )`,
    })
    .from(tenants)
    .orderBy(tenants.name);

  return (
    <>
      <div className="head">
        <h1>Tenants</h1>
      </div>

      <p className="note">
        A tenant is one business with its own assistant: its personality, facts, tools,
        look, and spending limit. Click a name to configure it, or use the shortcuts on
        the right of each row. Day-to-day work lives under Conversations (read what
        visitors asked) and each tenant&apos;s Facts &amp; knowledge (teach better answers).
      </p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Status</th>
            <th className="num" title="Visitor messages in the last 7 days">Messages 7d</th>
            <th className="num" title="Daily message limit. When reached, the bot politely stops until midnight. This is what makes the bill predictable.">Cap/day</th>
            <th className="num" title="Active embed keys: the public identifier a website uses to show this bot">Keys</th>
            <th>Last activity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/admin/tenants/${row.id}`}>{row.name}</Link>
              </td>
              <td>
                <code>{row.slug}</code>
              </td>
              <td>
                <span className={`pill ${row.status}`}>{row.status}</span>
              </td>
              <td className="num">{row.messages7d}</td>
              <td className="num">{row.cap}</td>
              <td className="num">{row.keys}</td>
              <td>{row.lastActivity ? <LocalTime iso={new Date(row.lastActivity).toISOString()} /> : "never"}</td>
              <td>
                <Link href={`/admin/tenants/${row.id}/kb`}>facts</Link>
                {" · "}
                <Link href={`/admin/tenants/${row.id}/analytics`}>analytics</Link>
                {" · "}
                <Link href={`/t/${row.slug}`} target="_blank">
                  chat
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="card">
        <h2>New tenant</h2>
        <NewTenantForm />
      </section>

      <TenantImport />
    </>
  );
}
