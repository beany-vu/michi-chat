"use client";

// The whole side rail, client-side because the mobile burger needs two behaviors CSS
// alone can't give: close when a link navigates (the layout persists across App Router
// navigations, so a checkbox hack would stay open), and close on Escape.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AdminNav } from "./AdminNav";
import { logoutAction } from "./actions";

export function AdminSide({ isOwner }: { isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating = the user picked something; the menu's job is done.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <aside className={`admin-side${open ? " admin-side-open" : ""}`}>
      <div className="admin-side-top">
        <div className="admin-logo">michi-chat</div>
        <button
          type="button"
          className="admin-burger"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            {open ? (
              <>
                <path d="M5 5l10 10" />
                <path d="M15 5L5 15" />
              </>
            ) : (
              <>
                <path d="M3.5 6h13" />
                <path d="M3.5 10h13" />
                <path d="M3.5 14h13" />
              </>
            )}
          </svg>
        </button>
      </div>
      {/* Hiding owner links is UX; the pages and actions enforce the role themselves. */}
      <AdminNav isOwner={isOwner} />
      <a
        className="admin-guide"
        href="https://beany-vu.github.io/michi-chat/owner/setup"
        target="_blank"
        rel="noopener noreferrer"
      >
        Guide &amp; help ↗
      </a>
      <form action={logoutAction} className="admin-side-foot">
        <button type="submit" className="ghost">
          Sign out
        </button>
      </form>
    </aside>
  );
}
