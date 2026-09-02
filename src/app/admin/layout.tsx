// Session gate for the admin area. This is UX only: it makes unauthenticated browsing
// redirect, but it does NOT protect server actions, which run before a layout re-renders.
// The real guard is requireAdmin() at the top of each action in ./actions.ts.

import type { Metadata } from "next";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminSide } from "./AdminSide";
import "./admin.css";

export const metadata: Metadata = { title: "Admin console - michi-chat" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  // The login page renders inside this layout too, so it cannot require a session.
  if (!session) return <div className="admin">{children}</div>;

  return (
    <div className="admin admin-shell">
      {/* Sidebar rail on desktop; a burger-toggled dropdown on small screens (the rail
          grew too many items for the old horizontal strip). See AdminSide.tsx. */}
      <AdminSide isOwner={session.role === "owner"} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
