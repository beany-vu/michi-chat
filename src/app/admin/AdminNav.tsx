"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Hairline stroke icons, drawn inline so there is no icon-font or dependency. They
// inherit currentColor, so the CSS colors them with the label.
const ICON = {
  tenants: (
    <path d="M3.2 9.6 10 3.6l6.8 6v6.2a1.2 1.2 0 0 1-1.2 1.2H4.4a1.2 1.2 0 0 1-1.2-1.2Z" />
  ),
  conversations: (
    <path d="M3.5 5.8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5.4a2 2 0 0 1-2 2H8.4L5 16.2v-3h.5a2 2 0 0 1-2-2Z" />
  ),
  usage: (
    <>
      <path d="M4.5 16.5v-6" />
      <path d="M10 16.5V4.5" />
      <path d="M15.5 16.5V12" />
    </>
  ),
  accounts: (
    <>
      <circle cx="10" cy="6.7" r="3" />
      <path d="M4.2 16.5a5.8 5.8 0 0 1 11.6 0" />
    </>
  ),
  activity: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.6V10l2.4 1.9" />
    </>
  ),
  unanswered: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M8 8a2 2 0 1 1 2.6 1.9c-.4.15-.6.5-.6.9v.4" />
      <path d="M10 13.6v.01" />
    </>
  ),
} as const;

const ITEMS: { href: string; label: string; icon: keyof typeof ICON; exact?: boolean; ownerOnly?: boolean }[] = [
  { href: "/admin", label: "Tenants", icon: "tenants", exact: true },
  { href: "/admin/conversations", label: "Conversations", icon: "conversations" },
  { href: "/admin/unanswered", label: "Unanswered", icon: "unanswered" },
  { href: "/admin/usage", label: "Usage", icon: "usage" },
  { href: "/admin/users", label: "Accounts", icon: "accounts", ownerOnly: true },
  { href: "/admin/audit", label: "Activity", icon: "activity", ownerOnly: true },
];

export function AdminNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  return (
    <nav>
      {ITEMS.filter((item) => !item.ownerOnly || isOwner).map((item) => {
        // "Tenants" also owns the tenant editor pages, which live under /admin/tenants/.
        const active = item.exact
          ? pathname === "/admin" || pathname.startsWith("/admin/tenants")
          : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICON[item.icon]}
            </svg>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
