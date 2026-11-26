/**
 * D-178.gate (D-290 R2): agent access is the Skippy agent switch plus the
 * account allow-list, never a plan. One switch covers both transports (OAuth
 * plus MCP, and the plain REST agent routes), and the call cap is the one
 * D-141 rate (D-290 R6), below a person's.
 *
 * The cap stays in process memory: it throttles abuse, and a restart or a
 * second instance only loosens it without moving money. Money and request
 * limits are durable and live in the grant store.
 */
import { AGENT_DAILY_CALL_CAP, AGENT_HOURLY_CALL_CAP } from "../shared/seekerAgents";
import { parseSkippieAllowedIds } from "./skippieAllowList";

/** The one switch. Off unless the value is exactly "true". */
export function agentPortalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SKIPPIE_AGENT_ENABLED === "true";
}

/** SKIPPY-7 (D-201 (4), D-141): auto-send switch. Off unless the value is exactly "true". */
export function agentAutoSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SKIPPIE_AGENT_AUTOSEND_ENABLED === "true";
}

/** True only when the switch is on and the account is on the allow-list; an empty list allows nobody. */
export function agentPortalAllowed(userId: number, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!agentPortalEnabled(env)) return false;
  return parseSkippieAllowedIds(env.SKIPPIE_AGENT_USER_IDS).has(userId);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const callWindows = new Map<number, { hourStart: number; hourCount: number; dayStart: number; dayCount: number }>();

/** True when this grant has used its hourly or daily call allowance (D-290 R6). */
export function agentCallLimited(grantId: number, nowMs: number): boolean {
  const hour = Math.floor(nowMs / 3_600_000);
  const day = Math.floor(nowMs / DAY_MS);
  const seen = callWindows.get(grantId);
  const state = {
    hourStart: hour,
    hourCount: seen && seen.hourStart === hour ? seen.hourCount : 0,
    dayStart: day,
    dayCount: seen && seen.dayStart === day ? seen.dayCount : 0,
  };
  if (state.hourCount >= AGENT_HOURLY_CALL_CAP || state.dayCount >= AGENT_DAILY_CALL_CAP) return true;
  state.hourCount += 1;
  state.dayCount += 1;
  callWindows.set(grantId, state);
  if (callWindows.size > 10_000) callWindows.clear();
  return false;
}

/** Tests only: drop every in-process call window. */
export function resetAgentCallWindowsForTest(): void { callWindows.clear(); }
