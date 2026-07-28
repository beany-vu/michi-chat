// Fixed-window rate limiting, one atomic upsert per check.
//
// In Postgres rather than an in-process Map for a boring reason: a Map resets on every
// dev HMR reload, so you can never tell whether the limiter works. Redis would be the
// production answer; there is no Redis in this compose file and borrowing another
// project's is worse than a table.

import { sql } from "drizzle-orm";
import { dbRoot } from "@/db";
import { rateBuckets } from "@/db/schema";

export interface Limit {
  key: string;
  windowSeconds: number;
  max: number;
}

/** Returns true when the caller is over the limit for this window. */
export async function isRateLimited({ key, windowSeconds, max }: Limit): Promise<boolean> {
  const [row] = await dbRoot
    .insert(rateBuckets)
    .values({
      bucketKey: key,
      // Snap to the window so every caller in the same window hits the same row.
      windowStart: sql`to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds})`,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [rateBuckets.bucketKey, rateBuckets.windowStart],
      set: { count: sql`${rateBuckets.count} + 1` },
    })
    .returning({ count: rateBuckets.count });

  return (row?.count ?? 0) > max;
}

/** Housekeeping; nothing reads old windows. Called opportunistically, failure is fine. */
export async function pruneRateBuckets(): Promise<void> {
  await dbRoot
    .delete(rateBuckets)
    .where(sql`${rateBuckets.windowStart} < now() - interval '1 day'`);
}
