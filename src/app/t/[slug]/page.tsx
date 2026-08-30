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
  const brandName = branding.title || tenant.name;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          {branding.logoUrl ? (
            // Rendered by the visitor's browser, never fetched by this server, so the
            // no-tenant-URLs rule (an SSRF rule) does not apply. Validated https on save.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="brand-logo" src={branding.logoUrl} alt="" />
          ) : (
            <span className="brand-mark" aria-hidden style={{ color: branding.accent }}>
              ●
            </span>
          )}
          <span className="brand-name">{brandName}</span>
          {branding.title && branding.title !== tenant.name && (
            <span className="brand-sub">{tenant.name}</span>
          )}
        </div>
      </header>
      <ChatPanel
        embedKey={embedKey}
        title={branding.greeting ?? `Chat with ${tenant.name}`}
        subtitle={branding.subtitle}
        placeholder={branding.placeholder}
        suggestions={branding.suggestions ?? []}
        disclaimer={branding.disclaimer}
        modelLabel={tenant.model ?? process.env.CHAT_MODEL ?? "michi"}
      />
    </div>
  );
}
