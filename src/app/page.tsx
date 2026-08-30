// The root path serves the default tenant, so local development stays one click. Every
// tenant, including this one, is also reachable at /t/<slug>.

import { redirect } from "next/navigation";
import { DEFAULT_TENANT_SLUG } from "@/lib/serve-tenant";

// Without this the page is prerendered and the redirect target is baked at BUILD time,
// so a runtime DEFAULT_TENANT_SLUG in the container would be silently ignored.
export const dynamic = "force-dynamic";

export default function Home() {
  redirect(`/t/${DEFAULT_TENANT_SLUG}`);
}
