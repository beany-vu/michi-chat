"use client";

// The "Importing 8 of 9 documents, 3,210 of 7,412 chunks…" banner. While a job runs it
// asks the server component tree to re-render every few seconds, so the numbers move
// without the operator touching Reload. Finished and failed jobs show their summary for
// a while (see SHOW_FINISHED_FOR_MS), then the banner leaves on its own.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isWorthShowing, progressLine, type ImportJobView } from "@/lib/import-progress";

const POLL_MS = 3000;

export function ImportStatus({ job }: { job: ImportJobView | null }) {
  const router = useRouter();
  const running = job?.status === "running";

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, router]);

  if (!job || !isWorthShowing(job)) return null;

  return (
    <div className={`import-status ${job.status}`} role="status" aria-live="polite">
      {running && <span className="spinner-inline" aria-hidden />}
      {/* The "started 3 min ago" part depends on the clock, so server and client render
          can differ by a second: harmless, and not worth a hydration warning. */}
      <span suppressHydrationWarning>{progressLine(job)}</span>
    </div>
  );
}
