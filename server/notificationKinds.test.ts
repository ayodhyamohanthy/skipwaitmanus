import { describe, expect, it } from "vitest";
import { transitionNotificationKind } from "./notificationKinds";
import { notificationItemSchema } from "../client/src/components/alerts/notifications";

describe("notification kinds", () => {
  it("maps transitions to kinds", () => {
    expect(transitionNotificationKind("approve", "approved")).toBe("ask_accepted");
    expect(transitionNotificationKind("review", "approved")).toBe("ask_accepted");
    expect(transitionNotificationKind("review", "rejected")).toBe("ask_passed");
    expect(transitionNotificationKind("pass", "pending")).toBe("ask_passed");
    // D-035: a not-fixable pass is still a pass to the person reading it.
    expect(transitionNotificationKind("pass_release", "pending")).toBe("ask_passed");
    expect(transitionNotificationKind("claim", "pending")).toBe("ask_claimed");
    expect(transitionNotificationKind("expire", "closed")).toBe("ask_expired");
    expect(transitionNotificationKind("progress", "interview")).toBe("ask_update");
  });
  it("old rows without kind still parse", () => {
    const base = { id: 1, category: "status", title: "t", body: "b", readAt: null, createdAt: new Date().toISOString() };
    expect(notificationItemSchema.safeParse(base).success).toBe(true);
    expect(notificationItemSchema.safeParse({ ...base, kind: "ask_accepted", refId: 4 }).success).toBe(true);
    expect(notificationItemSchema.safeParse({ ...base, kind: null, refId: null }).success).toBe(true);
  });
});
