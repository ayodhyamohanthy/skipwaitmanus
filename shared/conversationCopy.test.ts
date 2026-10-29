import { describe, expect, it } from "vitest";
import {
  CLOSED_UNCLAIMED_LINE,
  DECLINED_LINE,
  SUPPORTING_COPY_FORBIDDEN,
  WITHDRAWN_LINE,
  WITHDRAW_CONFIRM_AWAITING,
  WITHDRAW_CONFIRM_VISIBLE,
  seekerTerminalLine,
  withdrawConfirmLine,
} from "./conversationCopy";

const LINE_CONSTANTS = [
  CLOSED_UNCLAIMED_LINE,
  DECLINED_LINE,
  WITHDRAWN_LINE,
  WITHDRAW_CONFIRM_AWAITING,
  WITHDRAW_CONFIRM_VISIBLE,
] as const;

describe("shared conversation copy", () => {
  it("keeps every line exactly as the contract states it", () => {
    expect(CLOSED_UNCLAIMED_LINE).toBe("Nobody could take it. This referral request is closed.");
    expect(DECLINED_LINE).toBe("It’s not a judgment of you. This referral request was declined.");
    expect(WITHDRAWN_LINE).toBe("You withdrew this referral request.");
    expect(WITHDRAW_CONFIRM_AWAITING).toBe(
      "It never reached a verified employee, so nothing was used for this referral request.",
    );
    expect(WITHDRAW_CONFIRM_VISIBLE).toBe(
      "It leaves the referrer’s queue and no longer counts toward your open referral requests.",
    );
  });

  it("never carries slot, credit, refund, clock, capacity or ask wording", () => {
    for (const line of LINE_CONSTANTS) {
      for (const pattern of SUPPORTING_COPY_FORBIDDEN) {
        expect(line).not.toMatch(pattern);
      }
    }
  });

  it("states no amount and never names a completed referral", () => {
    expect(WITHDRAW_CONFIRM_AWAITING).not.toMatch(/\d/);
    expect(WITHDRAW_CONFIRM_AWAITING).not.toMatch(/\breferral\b(?! request)/i);
  });

  it("maps the terminal statuses and only those", () => {
    expect(seekerTerminalLine("declined", { claimed: false })).toBe(DECLINED_LINE);
    expect(seekerTerminalLine("withdrawn", { claimed: false })).toBe(WITHDRAWN_LINE);
    expect(seekerTerminalLine("closed", { claimed: false })).toBe(CLOSED_UNCLAIMED_LINE);
    expect(seekerTerminalLine("closed", { claimed: true })).toBeNull();
    for (const status of ["pending", "approved", "intro_made", "interview", "offer"] as const) {
      expect(seekerTerminalLine(status, { claimed: false })).toBeNull();
    }
  });

  it("picks the awaiting confirm for coverage states and the visible line for every other", () => {
    expect(withdrawConfirmLine("waiting_for_coverage")).toBe(WITHDRAW_CONFIRM_AWAITING);
    expect(withdrawConfirmLine("held_for_credit")).toBe(WITHDRAW_CONFIRM_AWAITING);
    expect(withdrawConfirmLine("available_for_review")).toBe(WITHDRAW_CONFIRM_VISIBLE);
    expect(withdrawConfirmLine(null)).toBe(WITHDRAW_CONFIRM_VISIBLE);
    expect(withdrawConfirmLine(undefined)).toBe(WITHDRAW_CONFIRM_VISIBLE);
  });
});
