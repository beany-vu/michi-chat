import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStale,
  isWorthShowing,
  progressLine,
  SHOW_FINISHED_FOR_MS,
  STALE_AFTER_MS,
  type ImportJobView,
} from "./import-progress";

const now = new Date("2026-09-06T15:00:00Z");
const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();

const base: ImportJobView = {
  id: "job",
  status: "running",
  source: "admin",
  docsTotal: 9,
  docsDone: 7,
  chunksTotal: 7412,
  chunksDone: 3210,
  currentTitle: "HS 2022 product codes",
  message: null,
  startedAt: iso(3 * 60_000),
  updatedAt: iso(5_000),
  finishedAt: null,
};

describe("progressLine", () => {
  it("shows documents, chunks and the document being embedded while running", () => {
    assert.equal(
      progressLine(base, now),
      'Importing: 7 of 9 documents, 3,210 of 7,412 chunks, embedding "HS 2022 product codes". Started 3 min ago.',
    );
  });

  it("omits the chunk part when the plan has no chunks", () => {
    const line = progressLine({ ...base, chunksTotal: 0, chunksDone: 0, currentTitle: null }, now);
    assert.equal(line, "Importing: 7 of 9 documents. Started 3 min ago.");
  });

  it("summarises a finished import with duration and age", () => {
    const job: ImportJobView = {
      ...base,
      status: "done",
      docsDone: 9,
      chunksDone: 7412,
      currentTitle: null,
      startedAt: iso(6 * 60_000),
      finishedAt: iso(2 * 60_000),
      updatedAt: iso(2 * 60_000),
    };
    assert.equal(progressLine(job, now), "Imported 9 documents (7,412 chunks embedded) in 4 min, finished 2 min ago.");
  });

  it("names the document and the error when failed", () => {
    const job: ImportJobView = {
      ...base,
      status: "failed",
      message: "embedding service unavailable",
      startedAt: iso(70_000),
      finishedAt: iso(10_000),
    };
    assert.equal(
      progressLine(job, now),
      'Import failed while embedding "HS 2022 product codes" in 60s: embedding service unavailable',
    );
  });
});

describe("staleness", () => {
  it("a running job with a fresh heartbeat is alive", () => {
    assert.equal(isStale(base, now), false);
  });

  it("a running job silent for longer than the limit is dead", () => {
    assert.equal(isStale({ ...base, updatedAt: iso(STALE_AFTER_MS + 1_000) }, now), true);
  });

  it("finished jobs are never stale", () => {
    assert.equal(isStale({ ...base, status: "done", updatedAt: iso(STALE_AFTER_MS * 5) }, now), false);
  });
});

describe("isWorthShowing", () => {
  it("shows a live running job and hides a dead one", () => {
    assert.equal(isWorthShowing(base, now), true);
    assert.equal(isWorthShowing({ ...base, updatedAt: iso(STALE_AFTER_MS + 1) }, now), false);
  });

  it("keeps a finished job visible for a while, then drops it", () => {
    const done: ImportJobView = { ...base, status: "done", finishedAt: iso(60_000), updatedAt: iso(60_000) };
    assert.equal(isWorthShowing(done, now), true);
    const old = { ...done, finishedAt: iso(SHOW_FINISHED_FOR_MS + 1), updatedAt: iso(SHOW_FINISHED_FOR_MS + 1) };
    assert.equal(isWorthShowing(old, now), false);
  });
});
