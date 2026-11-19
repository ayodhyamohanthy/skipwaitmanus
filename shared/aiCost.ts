/**
 * AI cost accounting for the plan-family benefit tools (main, Oct 21): every
 * tool call logs tool, model, tokens in/out, cost, and plan so benefit caps
 * can be set from real cost before pricing go-live.
 *
 * Token prices are ops-tunable config, USD per 1M tokens, keyed by model id.
 * The map starts EMPTY on purpose: prices are not invented. An unpriced model
 * logs with costUsdMicros = null - tool/model/tokens/plan are still captured,
 * and cost becomes computable the moment ops enters the provider's current
 * prices here.
 */

export const AI_MODEL_TOKEN_PRICES_USD_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {};

/**
 * Estimated cost in micro-USD (1/1,000,000 dollar), or null when the model is
 * unpriced. tokens * price-per-1M = micro-USD exactly.
 */
export function estimateAiCostUsdMicros(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number | null {
  const price = AI_MODEL_TOKEN_PRICES_USD_PER_MILLION[model];
  if (!price) return null;
  return Math.round(tokensIn * price.input + tokensOut * price.output);
}
