// The tenant-facing chat page. Every tenant is reachable at /t/<slug>, which is what
// makes tenant #2 testable in a browser long before a widget embed exists.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { ChatPanel } from "@/components/ChatPanel";
import { loadTenantBySlug } from "@/lib/serve-tenant";

// Visitor-page analytics (GA4), opt-in via env, admin pages deliberately untracked.
// Read server-side at runtime, NOT as NEXT_PUBLIC_*: the published image is prebuilt,
// so a build-time inline would freeze whatever the image builder had (nothing).
// Format-checked because the value is interpolated into an inline script.
const GA_ID = /^G-[A-Z0-9]{4,20}$/.test(process.env.GA_MEASUREMENT_ID ?? "")
  ? (process.env.GA_MEASUREMENT_ID as string)
  : null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadTenantBySlug(slug);
  const name = loaded?.tenant.branding?.title || loaded?.tenant.name || "Chat";
  return { title: name, description: `Chat with ${name}` };
}

export default async function TenantChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { slug } = await params;
  // embed=1 is set by the floating widget, which already draws its own header bar; hiding
  // the page's topbar then avoids two stacked "Business Name" headers eating chat space.
  const embed = (await searchParams).embed === "1";
  const loaded = await loadTenantBySlug(slug);
  if (!loaded) notFound();

  const { tenant, embedKey } = loaded;
  const branding = tenant.branding ?? {};
  const brandName = branding.title || tenant.name;

  // The tenant's accent recolors the whole widget (send button, bubbles, chips) by
  // overriding the CSS custom properties; the soft tint is derived so one admin field
  // stays the single source of the theme.
  const themeStyle = branding.accent
    ? ({
        "--accent": branding.accent,
        "--accent-soft": `color-mix(in srgb, ${branding.accent} 16%, transparent)`,
        "--bubble-user": branding.accent,
        "--bubble-user-ink": "#ffffff",
      } as React.CSSProperties)
    : undefined;

  return (
    <div className={`app${embed ? " app-embed" : ""}`} style={themeStyle} data-theme={branding.theme}>
      {!embed && (
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
      )}
      <ChatPanel
        embedKey={embedKey}
        title={branding.greeting ?? `Chat with ${tenant.name}`}
        subtitle={branding.subtitle}
        placeholder={branding.placeholder}
        suggestions={branding.suggestions ?? []}
        disclaimer={branding.disclaimer}
        // modelLabel deliberately not passed: with it the credit wraps to two lines on
        // phones, and the model alias means nothing to visitors anyway.
      />
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          {/* Tenants separate two ways: page_path is /t/<slug> on every hit, and the
              `tenant` event param is there for a GA custom dimension. tenant.slug is a
              DB value constrained to [a-z0-9-] on creation, safe to inline. */}
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { tenant: '${tenant.slug}' });`}
          </Script>
        </>
      )}
    </div>
  );
}
