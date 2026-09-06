// Progress bookkeeping for tenant imports. The import itself lives in tenant-transfer.ts;
// this module owns the import_jobs row: create it, heartbeat it, finish it, and read it
// back for the admin's "Importing 8 of 9 documents…" banner. The pure parts (what the
// banner says, when a job is dead) live in import-progress.ts and are re-exported here.

import { and, desc, eq, gt } from "drizzle-orm";
import { dbRoot } from "@/db";
import { importJobs } from "@/db/schema";
import { isStale, STALE_AFTER_MS, type ImportJobStatus, type ImportJobView } from "./import-progress";

export * from "./import-progress";

function toView(row: typeof importJobs.$inferSelect): ImportJobView {
  return {
    id: row.id,
    status: row.status as ImportJobStatus,
    source: row.source,
    docsTotal: row.docsTotal,
    docsDone: row.docsDone,
    chunksTotal: row.chunksTotal,
    chunksDone: row.chunksDone,
    currentTitle: row.currentTitle,
    message: row.message,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

/** The newest job for a tenant, or null. A stale "running" row is marked failed on read,
 *  so a dead import never blocks the next one and never spins forever on the page. */
export async function latestImportJob(tenantId: string): Promise<ImportJobView | null> {
  const [row] = await dbRoot
    .select()
    .from(importJobs)
    .where(eq(importJobs.tenantId, tenantId))
    .orderBy(desc(importJobs.startedAt))
    .limit(1);
  if (!row) return null;
  if (isStale(row)) {
    const [fixed] = await dbRoot
      .update(importJobs)
      .set({
        status: "failed",
        message:
          "The import stopped without finishing (the server restarted or the request was cut off). Run it again.",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(importJobs.id, row.id), eq(importJobs.status, "running")))
      .returning();
    return toView(fixed ?? row);
  }
  return toView(row);
}

/** A live import for this tenant, or null. Used to refuse a concurrent second import. */
export async function runningImportJob(tenantId: string): Promise<ImportJobView | null> {
  const [row] = await dbRoot
    .select()
    .from(importJobs)
    .where(
      and(
        eq(importJobs.tenantId, tenantId),
        eq(importJobs.status, "running"),
        gt(importJobs.updatedAt, new Date(Date.now() - STALE_AFTER_MS)),
      ),
    )
    .orderBy(desc(importJobs.startedAt))
    .limit(1);
  return row ? toView(row) : null;
}

export async function createImportJob(input: {
  tenantId: string;
  source: string;
  docsTotal: number;
  chunksTotal: number;
}): Promise<string> {
  const [row] = await dbRoot
    .insert(importJobs)
    .values({
      tenantId: input.tenantId,
      source: input.source,
      docsTotal: input.docsTotal,
      chunksTotal: input.chunksTotal,
    })
    .returning({ id: importJobs.id });
  return row.id;
}

/** Heartbeat + counters. Cheap; called per document and per embedding batch. */
export async function touchImportJob(
  jobId: string,
  patch: { docsDone?: number; chunksDone?: number; currentTitle?: string | null },
): Promise<void> {
  await dbRoot
    .update(importJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(importJobs.id, jobId));
}

export async function finishImportJob(
  jobId: string,
  outcome: { status: "done" | "failed"; message: string; docsDone?: number; chunksDone?: number },
): Promise<void> {
  await dbRoot
    .update(importJobs)
    .set({
      status: outcome.status,
      message: outcome.message,
      ...(outcome.docsDone !== undefined ? { docsDone: outcome.docsDone } : {}),
      ...(outcome.chunksDone !== undefined ? { chunksDone: outcome.chunksDone } : {}),
      currentTitle: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(importJobs.id, jobId));
}
