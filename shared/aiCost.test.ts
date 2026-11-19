import { describe, expect, it } from "vitest";
import { AI_MODEL_TOKEN_PRICES_USD_PER_MILLION, estimateAiCostUsdMicros } from "./aiCost";

describe("AI cost estimation", () => {
  it("returns null for an unpriced model instead of inventing a cost", () => {
    expect(estimateAiCostUsdMicros("some-unpriced-model", 1000, 500)).toBeNull();
  });

  it("computes micro-USD from the configured price map", () => {
    AI_MODEL_TOKEN_PRICES_USD_PER_MILLION["test-model"] = { input: 0.25, output: 2 };
    try {
      // 1M in @ $0.25 + 1M out @ $2.00 = $2.25 = 2,250,000 micro-USD.
      expect(estimateAiCostUsdMicros("test-model", 1_000_000, 1_000_000)).toBe(2_250_000);
      // 2k in @ $0.25 + 500 out @ $2.00 = $0.0015 = 1,500 micro-USD.
      expect(estimateAiCostUsdMicros("test-model", 2000, 500)).toBe(1500);
    } finally {
      delete AI_MODEL_TOKEN_PRICES_USD_PER_MILLION["test-model"];
    }
  });
});
