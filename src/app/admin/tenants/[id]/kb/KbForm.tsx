"use client";

import { useActionState } from "react";
import { saveKbDocumentAction } from "../../../actions";

export function KbForm({
  tenantId,
  initialTitle,
  initialContent,
}: {
  tenantId: string;
  initialTitle?: string;
  initialContent?: string;
}) {
  const [state, action, pending] = useActionState(
    saveKbDocumentAction.bind(null, tenantId),
    null,
  );

  return (
    <form action={action} className="editor">
      <fieldset>
        <legend>{initialTitle ? "Edit document" : "New document"}</legend>
        <label htmlFor="kb-title">Title</label>
        <input
          id="kb-title"
          name="title"
          defaultValue={initialTitle ?? ""}
          placeholder="Hours and location"
          required
        />
        <small>The document&apos;s identity: saving with an existing title replaces it.</small>

        <label htmlFor="kb-content">Content (markdown)</label>
        <textarea
          id="kb-content"
          name="content"
          rows={16}
          defaultValue={initialContent ?? ""}
          required
        />
        <small>
          Chunking is heading-aware: keep one fact per section under clear ## headings and
          retrieval stays precise. Saving chunks and embeds immediately.
        </small>
      </fieldset>

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Embedding…" : "Save & embed"}
        </button>
        {state?.error && <span className="error">{state.error}</span>}
        {state?.ok && <span className="ok">Saved. {state.info}</span>}
      </div>
    </form>
  );
}
