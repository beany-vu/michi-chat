// Session gate for the admin area. This is UX only: it makes unauthenticated browsing
// redirect, but it does NOT protect server actions, which run before a layout re-renders.
// The real guard is requireAdmin() at the top of each action in ./actions.ts.

import Link from "next/link";
import { getAdminSession } from "@/lib/admin-auth";
import { logoutAction } from "./actions";
import "./admin.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  // The login page renders inside this layout too, so it cannot require a session.
  if (!session) return <div className="admin">{children}</div>;

  return (
    <div className="admin">
      <header className="admin-bar">
        <nav>
          <Link href="/admin">Tenants</Link>
          <Link href="/admin/conversations">Conversations</Link>
          <Link href="/admin/usage">Usage</Link>
          {/* Hiding the link is UX; the page and its actions enforce owner themselves. */}
          {session.role === "owner" && <Link href="/admin/users">Accounts</Link>}
        </nav>
        <form action={logoutAction}>
          <button type="submit" className="ghost">
            Sign out
          </button>
        </form>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
