// The audit trail, owner only: who did what, newest first. Append-only by design —
// there is no edit or delete here, because a trail you can prune is not a trail.

import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { auditLog } from "@/db/schema";
import { getAdminSession } from "@/lib/admin-auth";

export default async function AuditPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "owner") redirect("/admin");

  const rows = await dbRoot.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200);

  return (
    <>
      <div className="head">
        <h1>Activity</h1>
      </div>

      <p className="note">
        Every sign-in and every change, newest first: who did it, what they did, and to
        what. This log is append-only — nobody, including the owner, can edit or delete
        entries from here. If something looks wrong, disable the account on the Accounts
        page and the change trail stays intact.
      </p>

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Subject</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.createdAt.toLocaleString()}</td>
              <td>{row.actorLabel}</td>
              <td>
                <code>{row.action}</code>
              </td>
              <td>{row.subject}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="note">Nothing yet. Actions will appear as they happen.</p>}
    </>
  );
}
