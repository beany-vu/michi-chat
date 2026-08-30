"use client";

import { useActionState } from "react";
import { importTenantAction } from "./actions";

export function TenantImport() {
  const [state, action, pending] = useActionState(importTenantAction, null);
  return (
    <section className="card">
      <h2>Import a tenant</h2>
      <form action={action}>
        <label htmlFor="tenant-json">Tenant JSON file</label>
        <input id="tenant-json" name="file" type="file" accept=".json,application/json" required />
        <small>
          The file an &quot;Export JSON&quot; produces on any michi-chat instance: settings,
          branding, tools, origins and the knowledge base in one piece. Matched by slug  - 
          existing tenants are updated, new slugs are created. Knowledge is re-embedded here,
          so transfers work across different embedding models.
        </small>
        {state?.preview && (
          <>
            <p className="note" style={{ marginTop: 12 }}>
              This tenant already exists here. The import would do the following - tick the
              box and press Import again (re-select the file if the browser cleared it):
            </p>
            <ul className="query-list">
              {state.preview.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" name="confirm" />
          <span>Overwrite the existing tenant with this file (merge: extra documents are kept)</span>
        </label>
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="submit" disabled={pending}>
            {pending ? "Working…" : "Import tenant"}
          </button>
          {state?.error && <span className="error">{state.error}</span>}
          {state?.ok && <span className="ok">{state.info}</span>}
        </div>
      </form>
    </section>
  );
}
