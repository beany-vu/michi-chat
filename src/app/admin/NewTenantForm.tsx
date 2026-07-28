"use client";

import { useActionState } from "react";
import { createTenantAction } from "./actions";

export function NewTenantForm() {
  const [state, action, pending] = useActionState(createTenantAction, null);
  return (
    <form action={action} className="row-form">
      <div>
        <label htmlFor="new-name">Name</label>
        <input id="new-name" name="name" placeholder="Second Cafe" required />
      </div>
      <div>
        <label htmlFor="new-slug">Slug</label>
        <input id="new-slug" name="slug" placeholder="second-cafe" required />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
