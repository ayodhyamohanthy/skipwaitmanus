// D-115 plan family (main, Oct 21): persist one row per AI tool call -
// tool, model, tokens in/out, estimated cost, plan - so benefit caps can be
// set from real cost before pricing go-live. Cost is null until the model is
// priced in shared/aiCost.ts (prices are ops-entered, never invented).
//
// This logger must NEVER break an LLM call: any failure (db down, schema not
// yet reconciled) is warned and swallowed.

import { aiToolCallLogs } from "../drizzle/schema";
import { estimateAiCostUsdMicros } from "../shared/aiCost";
import { getDb } from "./db";

export type AiToolCallRecord = {
  /** Benefit tool or call site, e.g. "ask_coach", "career_copilot". */
  tool: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Plan the caller is on, when known (planFamily.ts id, or legacy plan id). */
  planId?: string | null;
  userId?: number | null;
};

export async function recordAiToolCall(entry: AiToolCallRecord): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(aiToolCallLogs).values({
      tool: entry.tool,
      model: entry.model,
      tokensIn: entry.tokensIn,
      tokensOut: entry.tokensOut,
      costUsdMicros: estimateAiCostUsdMicros(entry.model, entry.tokensIn, entry.tokensOut),
      planFamilyId: entry.planId ?? null,
      userId: entry.userId ?? null,
    });
  } catch (error) {
    console.warn("[ai-cost] failed to record tool call", error);
  }
}
