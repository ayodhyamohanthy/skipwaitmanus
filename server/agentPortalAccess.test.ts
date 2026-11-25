import { afterEach, describe, expect, it } from "vitest";
import {
  agentCallLimited,
  agentPortalAllowed,
  agentPortalEnabled,
  resetAgentCallWindowsForTest,
} from "./agentPortalAccess";
import { AGENT_DAILY_CALL_CAP, AGENT_HOURLY_CALL_CAP } from "../shared/seekerAgents";

const env = (over: Record<string, string | undefined> = {}) => ({ ...over }) as NodeJS.ProcessEnv;

afterEach(() => resetAgentCallWindowsForTest());

describe("agent portal gate (D-178.gate, D-290 R2)", () => {
  it("is closed unless the Skippy agent switch is exactly true", () => {
    for (const value of [undefined, "", "false", "1", "TRUE", "yes"]) {
      expect(agentPortalEnabled(env({ SKIPPIE_AGENT_ENABLED: value }))).toBe(false);
      expect(agentPortalAllowed(7, env({ SKIPPIE_AGENT_ENABLED: value, SKIPPIE_AGENT_USER_IDS: "7" }))).toBe(false);
    }
    expect(agentPortalEnabled(env({ SKIPPIE_AGENT_ENABLED: "true" }))).toBe(true);
  });

  it("allows only an account on the allow-list; an empty list allows nobody", () => {
    const on = { SKIPPIE_AGENT_ENABLED: "true" };
    expect(agentPortalAllowed(7, env({ ...on, SKIPPIE_AGENT_USER_IDS: "" }))).toBe(false);
    expect(agentPortalAllowed(7, env({ ...on, SKIPPIE_AGENT_USER_IDS: " , , " }))).toBe(false);
    expect(agentPortalAllowed(7, env({ ...on, SKIPPIE_AGENT_USER_IDS: "8,9" }))).toBe(false);
    expect(agentPortalAllowed(7, env({ ...on, SKIPPIE_AGENT_USER_IDS: "7" }))).toBe(true);
    expect(agentPortalAllowed(7, env({ ...on, SKIPPIE_AGENT_USER_IDS: " 8 , 7 " }))).toBe(true);
  });

  it("ignores junk allow-list entries instead of opening access", () => {
    const on = { SKIPPIE_AGENT_ENABLED: "true" };
    for (const list of ["abc", "0", "-7", "7.5", "NaN"]) {
      expect(agentPortalAllowed(7, env({ ...on, SKIPPIE_AGENT_USER_IDS: list }))).toBe(false);
    }
  });

  it("never reads a plan: the same account is allowed on any wallet", () => {
    // The gate takes only the account id and the environment, so no plan, tier or wallet can open it.
    expect(agentPortalAllowed.length).toBeLessThanOrEqual(2);
    expect(agentPortalAllowed(7, env({ SKIPPIE_AGENT_ENABLED: "true", SKIPPIE_AGENT_USER_IDS: "7" }))).toBe(true);
  });
});

describe("one call cap for both transports (D-290 R6)", () => {
  const HOUR = 3_600_000;
  const start = 0; // the epoch is both an hour and a day boundary

  it("allows the hourly cap and refuses the next call in the same hour", () => {
    expect(AGENT_HOURLY_CALL_CAP).toBe(20);
    expect(AGENT_DAILY_CALL_CAP).toBe(60);
    for (let i = 0; i < AGENT_HOURLY_CALL_CAP; i += 1) expect(agentCallLimited(3, start + i)).toBe(false);
    expect(agentCallLimited(3, start + AGENT_HOURLY_CALL_CAP)).toBe(true);
  });

  it("resets on the next hour", () => {
    for (let i = 0; i < AGENT_HOURLY_CALL_CAP; i += 1) agentCallLimited(3, start + i);
    expect(agentCallLimited(3, start + HOUR)).toBe(false);
  });

  it("caps a day at 60 calls even when no hour is full", () => {
    // 3 calls an hour for 20 hours reaches the daily cap without filling any hour.
    for (let hour = 0; hour < 20; hour += 1) {
      for (let i = 0; i < 3; i += 1) expect(agentCallLimited(3, start + hour * HOUR + i)).toBe(false);
    }
    expect(agentCallLimited(3, start + 20 * HOUR)).toBe(true);
    expect(agentCallLimited(3, start + 24 * HOUR)).toBe(false);
  });

  it("counts each grant separately", () => {
    for (let i = 0; i < AGENT_HOURLY_CALL_CAP; i += 1) agentCallLimited(3, start + i);
    expect(agentCallLimited(3, start + AGENT_HOURLY_CALL_CAP)).toBe(true);
    expect(agentCallLimited(4, start + AGENT_HOURLY_CALL_CAP)).toBe(false);
  });
});
