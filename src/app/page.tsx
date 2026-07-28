// The root path serves the default tenant, so local development stays one click. Every
// tenant, including this one, is also reachable at /t/<slug>.

import { redirect } from "next/navigation";
import { DEFAULT_TENANT_SLUG } from "@/lib/serve-tenant";

export default function Home() {
  redirect(`/t/${DEFAULT_TENANT_SLUG}`);
}
