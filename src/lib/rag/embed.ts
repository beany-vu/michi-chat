// Embeddings via the LiteLLM alias `embed` (see litellm/config.yaml). The app never
// knows the real model; swapping nomic-embed-text for a hosted model is config, except
// that kb_chunks.embedding is sized to EMBEDDING_DIMENSIONS, so a dimension change is a
// migration plus a re-embed of every chunk.

import OpenAI from "openai";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";

const openai = new OpenAI({
  baseURL: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
  apiKey: process.env.LITELLM_API_KEY ?? "sk-michi-dev",
});

const EMBED_MODEL = process.env.EMBED_MODEL ?? "embed";
// Ollama embeds serially anyway; small batches keep one failed request small.
const BATCH_SIZE = 16;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    // Explicit "float": the SDK's base64 default comes back garbled through the proxy
    // (LiteLLM re-encodes and the byte width is lost). The `embed` alias sets
    // drop_params, so LiteLLM accepts the param and strips it before Ollama, which
    // supports neither value.
    const response = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: batch,
      encoding_format: "float",
    });
    // The API may reorder; index is authoritative.
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `embedding has ${item.embedding.length} dimensions, schema expects ${EMBEDDING_DIMENSIONS}; ` +
            "the `embed` alias in litellm/config.yaml points at the wrong model",
        );
      }
      out.push(item.embedding);
    }
  }
  return out;
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
