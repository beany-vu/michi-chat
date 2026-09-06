// The pure half of import progress: what the banner says and when a job counts as dead.
// No database imports here on purpose, so the client-side banner can use it without
// dragging the DB module into the browser bundle.

export type ImportJobStatus = "running" | "done" | "failed";

/** The serializable shape the admin pages hand to the client banner. */
export interface ImportJobView {
  id: string;
  status: ImportJobStatus;
  source: string;
  docsTotal: number;
  docsDone: number;
  chunksTotal: number;
  chunksDone: number;
  currentTitle: string | null;
  message: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/** A "running" job whose heartbeat is older than this is treated as dead: the process
 *  that ran it is gone (container restart, killed request). Embedding one batch of 16
 *  chunks takes seconds, so ten minutes of silence is never a live import. */
export const STALE_AFTER_MS = 10 * 60 * 1000;

/** Finished jobs stay on the page this long, so the operator sees "Imported 9 documents"
 *  after the spinner, then the banner goes away on its own. */
export const SHOW_FINISHED_FOR_MS = 15 * 60 * 1000;

export function isStale(job: { status: string; updatedAt: Date | string }, now = new Date()): boolean {
  if (job.status !== "running") return false;
  return now.getTime() - new Date(job.updatedAt).getTime() > STALE_AFTER_MS;
}

/** Whether the banner should still be shown for this job. */
export function isWorthShowing(job: ImportJobView, now = new Date()): boolean {
  if (job.status === "running") return !isStale(job, now);
  const finished = job.finishedAt ? new Date(job.finishedAt).getTime() : new Date(job.updatedAt).getTime();
  return now.getTime() - finished < SHOW_FINISHED_FOR_MS;
}

function ago(iso: string, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

const n = (value: number) => value.toLocaleString("en-US");

/** The one line the banner shows. Plain words, numbers the operator can watch move. */
export function progressLine(job: ImportJobView, now = new Date()): string {
  if (job.status === "running") {
    const docs = `${n(job.docsDone)} of ${n(job.docsTotal)} documents`;
    const chunks = job.chunksTotal > 0 ? `, ${n(job.chunksDone)} of ${n(job.chunksTotal)} chunks` : "";
    const current = job.currentTitle ? `, embedding "${job.currentTitle}"` : "";
    return `Importing: ${docs}${chunks}${current}. Started ${ago(job.startedAt, now)}.`;
  }
  const took = job.finishedAt
    ? Math.max(1, Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000))
    : null;
  const tookText = took === null ? "" : took < 90 ? ` in ${took}s` : ` in ${Math.round(took / 60)} min`;
  if (job.status === "done") {
    const chunks = job.chunksTotal > 0 ? ` (${n(job.chunksDone)} chunks embedded)` : "";
    return `Imported ${n(job.docsTotal)} documents${chunks}${tookText}, finished ${ago(job.finishedAt ?? job.updatedAt, now)}.`;
  }
  const where = job.currentTitle ? ` while embedding "${job.currentTitle}"` : "";
  return `Import failed${where}${tookText}: ${job.message ?? "unknown error"}`;
}
