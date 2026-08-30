// Semantic answer cache. The analytics page showed one shape dominating real traffic:
// a fresh visitor opening with a paraphrase of "what time do you open". Those openers
// re-run the whole loop (embed, retrieve, model, maybe tools) to produce an answer the
// KB fully determines. This caches exactly that case and nothing else:
//
//   - FIRST messages of a conversation only. Follow-ups depend on history, and a cached
//     answer to "and on Sundays?" would be nonsense.
//   - Tight threshold. 0.05 cosine distance is near-paraphrase territory for
//     nomic-embed-text; "do you open Mondays" vs "do you close Mondays" must NOT match.
//   - Wiped whenever the tenant's knowledge or settings change, because every cached
//     answer is downstream of both.
//   - Never used for privacy-mode tenants: "store nothing" includes questions.

import { asc, cosineDistance, eq, sql } from "drizzle-orm";
import { dbRoot } from "@/db";
import { answerCache } from "@/db/schema";
import { embedText } from "./embed";

export const CACHE_MAX_DISTANCE = 0.05;
// Bound the table per tenant; oldest rows beyond this are pruned opportunistically.
const MAX_ROWS_PER_TENANT = 500;

export interface CachedAnswer {
  answer: string;
  model: string | null;
  /** Reused for storing, so a miss costs one embedding call total. */
  embedding: number[];
}

export async function lookupCachedAnswer(
  tenantId: string,
  question: string,
): Promise<{ hit: CachedAnswer | null; embedding: number[] }> {
  const embedding = await embedText(question);
  const distance = cosineDistance(answerCache.embedding, embedding);
  const [row] = await dbRoot
    .select({
      id: answerCache.id,
      answer: answerCache.answer,
      model: answerCache.model,
      distance: sql<number>`(${distance})::float8`,
    })
    .from(answerCache)
    .where(sql`${answerCache.tenantId} = ${tenantId} and ${answerCache.createdAt} > now() - interval '24 hours'`)
    .orderBy(asc(distance))
    .limit(1);

  if (!row || row.distance > CACHE_MAX_DISTANCE) return { hit: null, embedding };

  void dbRoot
    .update(answerCache)
    .set({ hits: sql`${answerCache.hits} + 1` })
    .where(eq(answerCache.id, row.id))
    .catch(() => {});
  return { hit: { answer: row.answer, model: row.model, embedding }, embedding };
}

export async function storeCachedAnswer(input: {
  tenantId: string;
  question: string;
  embedding: number[];
  answer: string;
  model: string;
}): Promise<void> {
  try {
    await dbRoot.insert(answerCache).values(input);
    await dbRoot.execute(sql`
      delete from answer_cache where id in (
        select id from answer_cache where tenant_id = ${input.tenantId}
        order by created_at desc offset ${MAX_ROWS_PER_TENANT}
      )
    `);
  } catch (error) {
    console.warn("answer cache store failed", error);
  }
}

/** Called whenever knowledge or tenant settings change: stale answers are worse than
 *  slow ones. */
export async function clearAnswerCache(tenantId: string): Promise<void> {
  try {
    await dbRoot.delete(answerCache).where(eq(answerCache.tenantId, tenantId));
  } catch (error) {
    console.warn("answer cache clear failed", error);
  }
}
