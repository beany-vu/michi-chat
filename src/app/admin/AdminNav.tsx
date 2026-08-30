"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Tenants", exact: true },
  { href: "/admin/conversations", label: "Conversations" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/users", label: "Accounts", ownerOnly: true },
  { href: "/admin/audit", label: "Activity", ownerOnly: true },
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
