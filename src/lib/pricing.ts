// Cost per million tokens, keyed by the LiteLLM alias the app asks for.
//
// Everything is zero today because dev routes to a local Ollama. The column exists anyway
// so the usage screen lights up the moment litellm/config.yaml points at a paid provider,
// which is also the moment LiteLLM's own virtual keys and budgets start being worth
// enabling (they need a database LiteLLM does not currently have).

export interface ModelPrice {
  inPerMillion: number;
  outPerMillion: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  michi: { inPerMillion: 0, outPerMillion: 0 },
  judge: { inPerMillion: 0, outPerMillion: 0 },
};

export function estimateCost(model: string | null, tokensIn: number, tokensOut: number): number {
  const price = MODEL_PRICES[model ?? "michi"];
  if (!price) return 0;
  return (tokensIn * price.inPerMillion + tokensOut * price.outPerMillion) / 1_000_000;
}
