// Ingestion and retrieval for the knowledge base. Retrieval is the leaf scan the schema
// was designed around: `where tenant_id = $1 order by embedding <=> $2 limit k`, no join,
// no vector index (see the long comment in src/db/schema.ts for why no index is correct
// at this size).

import { createHash } from "node:crypto";
import { and, asc, cosineDistance, eq, sql } from "drizzle-orm";
import { dbRoot } from "@/db";
import { kbChunks, kbDocuments } from "@/db/schema";
import { clearAnswerCache } from "./answer-cache";
import { chunkMarkdown } from "./chunk";
import { embedText, embedTexts } from "./embed";

export const contentHash = (content: string) =>
  createHash("sha256").update(content).digest("hex");

/**
 * Create or update one document and rebuild its chunks. Upsert is by (tenantId, title):
 * the title is the operator-facing identity of a document. Returns the number of chunks
 * written, or -1 when the content was unchanged and nothing was re-embedded.
 */
export async function ingestDocument(input: {
  tenantId: string;
  title: string;
  content: string;
}): Promise<number> {
  const hash = contentHash(input.content);

  // Cached answers are downstream of the knowledge; stale beats slow, never the reverse.
  void clearAnswerCache(input.tenantId);

  const [existing] = await dbRoot
    .select({ id: kbDocuments.id, contentHash: kbDocuments.contentHash })
    .from(kbDocuments)
    .where(and(eq(kbDocuments.tenantId, input.tenantId), eq(kbDocuments.title, input.title)))
    .limit(1);
  if (existing?.contentHash === hash) return -1;

  const chunks = chunkMarkdown(input.content, input.title);
  if (chunks.length === 0) throw new Error("document produced no chunks");
  // Embed BEFORE touching the tables: if the embedding service is down, the old chunks
  // keep serving and the document row never drifts from its chunks.
  const embeddings = await embedTexts(chunks.map((c) => `${c.heading}\n${c.content}`));

  return dbRoot.transaction(async (tx) => {
    let documentId = existing?.id;
    if (documentId) {
      await tx
        .update(kbDocuments)
        .set({ content: input.content, contentHash: hash, updatedAt: new Date() })
        .where(and(eq(kbDocuments.id, documentId), eq(kbDocuments.tenantId, input.tenantId)));
      await tx.delete(kbChunks).where(
        and(eq(kbChunks.documentId, documentId), eq(kbChunks.tenantId, input.tenantId)),
      );
    } else {
      const [created] = await tx
        .insert(kbDocuments)
        .values({ tenantId: input.tenantId, title: input.title, content: input.content, contentHash: hash })
        .returning({ id: kbDocuments.id });
      documentId = created.id;
    }

    await tx.insert(kbChunks).values(
      chunks.map((chunk, position) => ({
        tenantId: input.tenantId,
        documentId: documentId as string,
        heading: chunk.heading,
        content: chunk.content,
        position,
        embedding: embeddings[position],
      })),
    );
    return chunks.length;
  });
}

export async function deleteDocument(tenantId: string, documentId: string) {
  void clearAnswerCache(tenantId);
  // Chunks go via the composite-FK cascade.
  await dbRoot
    .delete(kbDocuments)
    .where(and(eq(kbDocuments.id, documentId), eq(kbDocuments.tenantId, tenantId)));
}

export interface KbHit {
  heading: string;
  content: string;
  /** Cosine distance: 0 identical, 2 opposite. Useful in evals, not shown to the model. */
  distance: number;
}

export async function searchKb(tenantId: string, query: string, k = 5): Promise<KbHit[]> {
  const embedding = await embedText(query);
  const distance = cosineDistance(kbChunks.embedding, embedding);
  return dbRoot
    .select({
      heading: kbChunks.heading,
      content: kbChunks.content,
      // Parentheses matter: without them the ::float8 binds to the vector parameter,
      // not to the distance result, and Postgres sees `vector <=> double precision`.
      distance: sql<number>`(${distance})::float8`,
    })
    .from(kbChunks)
    .where(eq(kbChunks.tenantId, tenantId))
    .orderBy(asc(distance))
    .limit(k);
}
