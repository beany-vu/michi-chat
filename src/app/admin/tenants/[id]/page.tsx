import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";
import { TOOL_PACKS } from "@/lib/tools";
import { TenantForm } from "./TenantForm";

export default async function TenantEditor({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { id } = await params;

  const [tenant] = await dbRoot.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) notFound();

  // The pack list is passed down as plain data so the form can render a field set per
  // pack: adding a pack file grows this UI with no edit here.
  const packs = Object.values(TOOL_PACKS).map((pack) => ({
    id: pack.id,
    label: pack.label,
    configFields: pack.configFields,
  }));

  return (
    <>
      <div className="head">
        <h1>{tenant.name}</h1>
        <div className="head-links">
          <Link href={`/admin/tenants/${tenant.id}/keys`}>Embed keys</Link>
          <Link href={`/admin/tenants/${tenant.id}/kb`}>Knowledge base</Link>
          <Link href={`/t/${tenant.slug}`} target="_blank">
            Open chat
          </Link>
          <Link href="/admin">Back</Link>
        </div>
      </div>
      <TenantForm tenant={tenant} packs={packs} />
    </>
  );
}
