// Account management, owner only. Staff hitting this URL are bounced by the page guard,
// and every action on it re-checks with requireOwner() - the page guard is UX, the
// action guard is the security boundary, same rule as everywhere in /admin.

import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { adminUsers } from "@/db/schema";
import { getAdminSession } from "@/lib/admin-auth";
import { setAdminUserStatusAction } from "../actions";
import { UserForm } from "./UserForm";
import { LocalTime } from "../LocalTime";

export default async function UsersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.role !== "owner") redirect("/admin");

  const users = await dbRoot.select().from(adminUsers).orderBy(desc(adminUsers.createdAt));

  return (
    <>
      <div className="head">
        <h1>Accounts</h1>
      </div>

      <p className="note">
        <strong>owner</strong> can do everything. <strong>staff</strong> can read
        conversations and usage and manage knowledge-base documents - the day-to-day  - 
        but cannot touch tenants, embed keys, origins, tools, or this page. The operator
        password from the environment always works as a break-glass owner login.
      </p>

      {users.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`pill ${user.role === "owner" ? "active" : ""}`}>{user.role}</span>
                </td>
                <td>
                  <span className={`pill ${user.status === "active" ? "active" : "disabled"}`}>
                    {user.status}
                  </span>
                </td>
                <td>{user.lastLoginAt ? <LocalTime iso={user.lastLoginAt.toISOString()} /> : "never"}</td>
                <td>
                  <form
                    action={setAdminUserStatusAction.bind(
                      null,
                      user.id,
                      user.status === "active" ? "disabled" : "active",
                    )}
                  >
                    <button type="submit" className="ghost">
                      {user.status === "active" ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <UserForm />
    </>
  );
}
