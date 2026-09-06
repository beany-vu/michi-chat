"use client";

import { useActionState } from "react";
import { createAdminUserAction } from "../actions";

export interface TenantOption {
  id: string;
  name: string;
}

export function UserForm({ tenants }: { tenants: TenantOption[] }) {
  const [state, action, pending] = useActionState(createAdminUserAction, null);
  return (
    <section className="card">
      <h2>New account</h2>
      <form action={action} className="editor">
        <fieldset>
          <label htmlFor="u-name">Name</label>
          <input id="u-name" name="name" required />

          <label htmlFor="u-email">Email</label>
          <input id="u-email" name="email" type="email" required />

          <label htmlFor="u-password">Password</label>
          <input id="u-password" name="password" type="password" minLength={10} required />
          <small>At least 10 characters. Share it over a channel you trust, then have them change it… once password changing exists; for now, re-create the account to rotate.</small>

          <label htmlFor="u-role">Role</label>
          <select id="u-role" name="role" defaultValue="staff">
            <option value="staff">staff - conversations, usage, knowledge base</option>
            <option value="owner">owner - everything, including this page</option>
          </select>

          <label>Tenants a staff account may see</label>
          <TenantChecks tenants={tenants} />
          <small>
            Staff see only the tenants ticked here, nowhere else in the admin; with none
            ticked they see nothing until you assign some. Owners always see everything, so
            this is ignored for an owner.
          </small>
        </fieldset>
        <div className="actions">
          <button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </button>
          {state?.error && <span className="error">{state.error}</span>}
          {state?.ok && <span className="ok">Created.</span>}
        </div>
      </form>
    </section>
  );
}

/** One checkbox per tenant, shared by the create form and the per-row assignment form. */
export function TenantChecks({
  tenants,
  checked = [],
}: {
  tenants: TenantOption[];
  checked?: string[];
}) {
  if (tenants.length === 0) return <small>No tenants yet.</small>;
  return (
    <div className="tenant-checks">
      {tenants.map((tenant) => (
        <label className="check" key={tenant.id}>
          <input type="checkbox" name="tenants" value={tenant.id} defaultChecked={checked.includes(tenant.id)} />
          <span>{tenant.name}</span>
        </label>
      ))}
    </div>
  );
}
