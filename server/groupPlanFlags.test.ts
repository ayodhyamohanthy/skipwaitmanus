import { afterEach, describe, expect, it, vi } from "vitest";
import { groupPlanFlagsSchema, readGroupPlanFlags, type GroupPlanFlags } from "./groupPlanFlags";

afterEach(() => vi.unstubAllEnvs());

const disabled: GroupPlanFlags = { groupPlanEnabled: false, delegatedSendEnabled: false };

describe("Group Plan flags", () => {
  it("defaults absent configuration off", () => {
    expect(readGroupPlanFlags({})).toEqual(disabled);
    expect(groupPlanFlagsSchema.parse({})).toEqual(disabled);
  });

  it("keeps explicit false configuration off", () => {
    expect(readGroupPlanFlags({
      GROUP_PLAN_ENABLED: "false",
      GROUP_DELEGATED_SEND_ENABLED: "false",
    })).toEqual(disabled);
  });

  it("enables Group Plan without enabling delegated send", () => {
    expect(readGroupPlanFlags({ GROUP_PLAN_ENABLED: "true" })).toEqual({
      groupPlanEnabled: true, delegatedSendEnabled: false,
    });
  });

  it("enables delegated send only with both exact true values", () => {
    expect(readGroupPlanFlags({
      GROUP_PLAN_ENABLED: "true", GROUP_DELEGATED_SEND_ENABLED: "true",
    })).toEqual({ groupPlanEnabled: true, delegatedSendEnabled: true });
  });

  it.each([undefined, "", "false", "TRUE", "True", "true ", " true", "1", "yes", "on"])(
    "keeps non-enabling server values off: %s",
    value => {
      expect(readGroupPlanFlags({ GROUP_PLAN_ENABLED: value })).toEqual(disabled);
      expect(readGroupPlanFlags({
        GROUP_PLAN_ENABLED: "true", GROUP_DELEGATED_SEND_ENABLED: value,
      })).toEqual({ groupPlanEnabled: true, delegatedSendEnabled: false });
    },
  );

  it.each([undefined, "false", "", "TRUE", "true ", "1"])(
    "rejects delegated send when Group Plan is not enabled: %s",
    groupPlan => {
      const env = { GROUP_PLAN_ENABLED: groupPlan, GROUP_DELEGATED_SEND_ENABLED: "true" };
      expect(groupPlanFlagsSchema.safeParse(env).success).toBe(false);
      expect(() => readGroupPlanFlags(env)).toThrow(/GROUP_PLAN_ENABLED/);
    },
  );

  it("rejects non-string values for the declared server flags", () => {
    for (const key of ["GROUP_PLAN_ENABLED", "GROUP_DELEGATED_SEND_ENABLED"]) {
      for (const value of [null, true, false, 0, 1, [], {}]) {
        expect(groupPlanFlagsSchema.safeParse({ [key]: value }).success).toBe(false);
      }
    }
  });

  it.each([null, true, "true", []])("rejects non-object configuration: %s", input => {
    expect(groupPlanFlagsSchema.safeParse(input).success).toBe(false);
  });

  it("rejects undeclared configuration fields", () => {
    expect(groupPlanFlagsSchema.safeParse({ GROUP_PLAN_ENABLE: "true" }).success).toBe(false);
    expect(groupPlanFlagsSchema.safeParse({ VITE_GROUP_PLAN: "true" }).success).toBe(false);
    expect(groupPlanFlagsSchema.safeParse({
      GROUP_PLAN_ENABLED: "true", delegatedSendEnabled: true,
    }).success).toBe(false);
  });

  it("reads only the explicit server keys from process.env on each call", () => {
    vi.stubEnv("GROUP_PLAN_ENABLED", undefined);
    vi.stubEnv("GROUP_DELEGATED_SEND_ENABLED", undefined);
    vi.stubEnv("VITE_GROUP_PLAN", "true");
    vi.stubEnv("UNRELATED_GROUP_SETTING", "true");
    expect(readGroupPlanFlags()).toEqual(disabled);
    vi.stubEnv("GROUP_PLAN_ENABLED", "true");
    expect(readGroupPlanFlags()).toEqual({ groupPlanEnabled: true, delegatedSendEnabled: false });
    vi.stubEnv("GROUP_DELEGATED_SEND_ENABLED", "true");
    expect(readGroupPlanFlags()).toEqual({ groupPlanEnabled: true, delegatedSendEnabled: true });
    vi.stubEnv("GROUP_PLAN_ENABLED", "false");
    expect(() => readGroupPlanFlags()).toThrow(/GROUP_PLAN_ENABLED/);
  });
});
