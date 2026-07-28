// The tenant-facing chat page. Every tenant is reachable at /t/<slug>, which is what
// makes tenant #2 testable in a browser long before a widget embed exists.

import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/ChatPanel";
import { loadTenantBySlug } from "@/lib/serve-tenant";

export default async function TenantChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await loadTenantBySlug(slug);
  if (!loaded) notFound();

  const { tenant, embedKey } = loaded;
  const branding = tenant.branding ?? {};

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden style={{ color: branding.accent }}>
            ●
          </span>
          <span className="brand-name">{branding.title ?? tenant.name}</span>
          <span className="brand-sub">{tenant.name}</span>
        </div>
      </header>
      <ChatPanel
        embedKey={embedKey}
        title={branding.greeting ?? `Chat with ${tenant.name}`}
        subtitle={branding.subtitle}
        placeholder={branding.placeholder}
        suggestions={branding.suggestions ?? []}
      />
    </div>
  );
}
