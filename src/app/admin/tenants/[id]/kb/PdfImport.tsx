"use client";

// PDF → KB, staged so the free work happens first and the owner sees the price of the
// paid work before it runs:
//
//   1. Analyze (free): parse, strip mechanical junk, token estimate + suggestions.
//   2. Review: one editable text box IS the selection tool - delete what customers
//      don't need; the gauge re-estimates live as text shrinks.
//   3. Tidy with AI (the one paid step, price shown on the button) or skip it.
//   4. Title + final edit + the normal Save & embed.

import { useActionState, useEffect, useState } from "react";
import { estimateTotalTokens, verdictFor, MAX_POLISH_CHARS } from "@/lib/pdf-import";
import { analyzePdfAction, polishKbTextAction, saveKbDocumentAction } from "../../../actions";

const VERDICT_COPY = {
  green: "cheap, about one conversation's worth",
  yellow: "noticeable, worth trimming first",
  red: "too big for one pass, trim or split",
} as const;

function Gauge({ chars }: { chars: number }) {
  const total = estimateTotalTokens(chars);
  const verdict = verdictFor(total);
  return (
    <p className={`pdf-gauge pdf-gauge-${verdict}`}>
      AI tidy-up estimate: ~{total.toLocaleString()} tokens ({VERDICT_COPY[verdict]})
    </p>
  );
}

export function PdfImport({ tenantId }: { tenantId: string }) {
  const [analysis, analyzeAction, analyzing] = useActionState(analyzePdfAction, null);
  const [polish, polishAction, polishing] = useActionState(
    polishKbTextAction.bind(null, tenantId),
    null,
  );
  const [saved, saveAction, saving] = useActionState(saveKbDocumentAction.bind(null, tenantId), null);

  const [stage, setStage] = useState<"pick" | "review" | "final">("pick");
  const [text, setText] = useState("");
  const [aiUsed, setAiUsed] = useState<{ tokensIn: number; tokensOut: number } | null>(null);

  useEffect(() => {
    if (analysis && "ok" in analysis && analysis.ok) {
      setText(analysis.triage.text);
      setAiUsed(null);
      setStage("review");
    }
  }, [analysis]);

  useEffect(() => {
    if (polish && "ok" in polish && polish.ok) {
      setText(polish.markdown);
      setAiUsed({ tokensIn: polish.tokensIn, tokensOut: polish.tokensOut });
      setStage("final");
    }
  }, [polish]);

  const triage = analysis && "ok" in analysis && analysis.ok ? analysis.triage : null;

  return (
    <section className="card">
      <h2>Import from a PDF</h2>

      <form action={analyzeAction}>
        <label htmlFor="kb-pdf">PDF file</label>
        <input id="kb-pdf" name="file" type="file" accept=".pdf,application/pdf" required />
        <small>
          Analyzing is free and calls no model: it reads the text out, strips page numbers
          and repeated headers, and estimates what an AI tidy-up would cost before you
          decide anything.
        </small>
        <div className="actions" style={{ marginTop: 12 }}>
          {/* One black primary per step: once a file is analyzed, the next step's button
              takes the lead and this one steps back to a ghost. */}
          <button type="submit" className={stage === "pick" ? undefined : "ghost"} disabled={analyzing}>
            {analyzing ? "Reading…" : stage === "pick" ? "Analyze PDF (free)" : "Analyze another PDF (free)"}
          </button>
          {analysis && "error" in analysis && <span className="error">{analysis.error}</span>}
        </div>
      </form>

      {stage !== "pick" && triage && (
        <>
          <p className="note" style={{ marginTop: 16 }}>
            {triage.pages} pages, {triage.charsRaw.toLocaleString()} characters read
            {triage.charsClean < triage.charsRaw && (
              <>
                , cleaned to {triage.charsClean.toLocaleString()} for free
                {triage.removed.length > 0 && <> ({triage.removed.join(" ")})</>}
              </>
            )}
            .
          </p>
          {triage.suggestions.length > 0 && (
            <ul className="note">
              {triage.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {stage === "review" && (
        <form action={polishAction}>
          <label htmlFor="kb-pdf-text">Extracted text (delete anything customers don&apos;t need)</label>
          <textarea
            id="kb-pdf-text"
            name="text"
            rows={14}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Gauge chars={text.length} />
          <div className="actions">
            <button type="submit" disabled={polishing || text.length > MAX_POLISH_CHARS}>
              {polishing
                ? "Tidying…"
                : `Tidy with AI (~${estimateTotalTokens(text.length).toLocaleString()} tokens)`}
            </button>
            <button type="button" className="ghost" onClick={() => setStage("final")}>
              Skip AI, use as is
            </button>
            {polish && "error" in polish && <span className="error">{polish.error}</span>}
          </div>
        </form>
      )}

      {stage === "final" && (
        <form action={saveAction}>
          {aiUsed ? (
            <p className="note">
              AI tidy-up done: {aiUsed.tokensIn.toLocaleString()}→
              {aiUsed.tokensOut.toLocaleString()} tokens actually used. Read it before
              saving; the model organizes, but you know the facts.
            </p>
          ) : (
            <p className="note">
              Saving the extracted text as is. Tidy it into short <code>##</code> sections
              below for the best retrieval.
            </p>
          )}
          <label htmlFor="kb-pdf-title">Title</label>
          <input id="kb-pdf-title" name="title" placeholder="From PDF: hours and policies" required />
          <label htmlFor="kb-pdf-content">Content (markdown)</label>
          <textarea
            id="kb-pdf-content"
            name="content"
            rows={14}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="actions">
            <button type="submit" disabled={saving}>
              {saving ? "Embedding…" : "Save & embed"}
            </button>
            <button type="button" className="ghost" onClick={() => setStage("review")}>
              Back
            </button>
            {saved?.error && <span className="error">{saved.error}</span>}
            {saved?.ok && <span className="ok">Saved. {saved.info}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
