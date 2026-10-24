import { describe, expect, it } from "vitest";
import { ASK_INVITE_TOKEN_PATTERN } from "../shared/askInvites";
import {
  AskInviteCapReachedError,
  AskInviteLinkActiveError,
  AskInviteNotFoundError,
  AskInviteNotWaitingError,
  hashAskInviteToken,
  newAskInviteToken,
} from "./askInvites";

describe("D-090 BYOR tokens", () => {
  it("mints a 43-character base64url token the contract accepts", () => {
    for (let i = 0; i < 50; i++) {
      const token = newAskInviteToken();
      expect(token).toHaveLength(43);
      expect(ASK_INVITE_TOKEN_PATTERN.test(token)).toBe(true);
    }
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newAskInviteToken()));
    expect(tokens.size).toBe(500);
  });

  it("stores the SHA-256 hex, never the token", () => {
    const token = newAskInviteToken();
    const hash = hashAskInviteToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashAskInviteToken(token)).toBe(hash);
    expect(hashAskInviteToken(newAskInviteToken())).not.toBe(hash);
  });

  it("gives each failure its own type, so a route can map it to the packet's status", () => {
    expect(new AskInviteNotFoundError().name).toBe("AskInviteNotFoundError");
    expect(new AskInviteNotWaitingError().name).toBe("AskInviteNotWaitingError");
    expect(new AskInviteLinkActiveError().name).toBe("AskInviteLinkActiveError");
    const cap = new AskInviteCapReachedError(new Date("2026-10-30T00:00:00.000Z"));
    expect(cap.name).toBe("AskInviteCapReachedError");
    expect(cap.nextSlotAt.toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });
});
