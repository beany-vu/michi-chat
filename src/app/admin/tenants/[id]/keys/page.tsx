import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { apiKeys, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";
import { createKeyAction, revokeKeyAction } from "../../../actions";

export default async function KeysPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { id } = await params;

  const [tenant] = await dbRoot.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) notFound();

  const keys = await dbRoot
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, id))
    .orderBy(desc(apiKeys.createdAt));

  return (
    <>
      <div className="head">
        <h1>{tenant.name}: embed keys</h1>
        <div className="head-links">
          <Link href={`/admin/tenants/${id}`}>Back to tenant</Link>
        </div>
      </div>

      <p className="note">
        These are shown in full because they are public by construction: the key ships in the
        page source of the customer&apos;s website. It selects a tenant, it does not authorise
        anything. Rotate by creating a new key, deploying it, then revoking the old one.
      </p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Key</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id}>
              <td>{key.name}</td>
              <td>
                <code>{key.publicKey}</code>
              </td>
              <td>{key.createdAt.toLocaleDateString()}</td>
              <td>{key.lastUsedAt ? key.lastUsedAt.toLocaleString() : "never"}</td>
              <td>
                <span className={`pill ${key.revokedAt ? "disabled" : "active"}`}>
                  {key.revokedAt ? "revoked" : "live"}
                </span>
              </td>
              <td>
                {!key.revokedAt && (
                  <form action={revokeKeyAction.bind(null, id, key.id)}>
                    <button type="submit" className="ghost">
                      Revoke
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="card">
        <h2>New key</h2>
        <form action={createKeyAction.bind(null, id)} className="row-form">
          <div>
            <label htmlFor="key-name">Label</label>
            <input id="key-name" name="name" placeholder="production site" required />
          </div>
          <button type="submit">Create</button>
        </form>
      </section>
    </>
  );
}
