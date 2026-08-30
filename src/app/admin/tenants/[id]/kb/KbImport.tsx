"use client";

import { useActionState } from "react";
import { importKbCsvAction } from "../../../actions";

export function KbImport({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(importKbCsvAction.bind(null, tenantId), null);
  return (
    <section className="card">
      <h2>Import from CSV</h2>
      <form action={action}>
        <label htmlFor="kb-csv">CSV file (columns: title, content)</label>
        <input id="kb-csv" name="file" type="file" accept=".csv,text/csv" required />
        <small>
          Same format the Export button produces, so export → edit in Excel/Sheets → import
          is the bulk-editing loop. Rows are matched by title: existing documents are
          replaced, new titles are created, and every imported document is re-embedded.
        </small>
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="submit" disabled={pending}>
            {pending ? "Importing & embedding…" : "Import"}
          </button>
          {state?.error && <span className="error">{state.error}</span>}
          {state?.ok && <span className="ok">{state.info}</span>}
        </div>
      </form>
    </section>
  );
}
