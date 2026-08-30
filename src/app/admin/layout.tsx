// Session gate for the admin area. This is UX only: it makes unauthenticated browsing
// redirect, but it does NOT protect server actions, which run before a layout re-renders.
// The real guard is requireAdmin() at the top of each action in ./actions.ts.

import { getAdminSession } from "@/lib/admin-auth";
import { AdminNav } from "./AdminNav";
import { logoutAction } from "./actions";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  // The login page renders inside this layout too, so it cannot require a session.
  if (!session) return <div className="admin">{children}</div>;

  return (
    <div className="admin admin-shell">
      {/* Sidebar rail on desktop; collapses to a horizontal strip on small screens
          purely in CSS, so there is no menu JavaScript to break. */}
      <aside className="admin-side">
        <div className="admin-logo">michi-chat</div>
        {/* Hiding owner links is UX; the pages and actions enforce the role themselves. */}
        <AdminNav isOwner={session.role === "owner"} />
        <form action={logoutAction} className="admin-side-foot">
          <button type="submit" className="ghost">
            Sign out
          </button>
        </form>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
