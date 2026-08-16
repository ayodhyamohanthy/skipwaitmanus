import { describe, expect, it } from "vitest";
import { resolveSyncedUserRole } from "./db";

describe("Clerk user role synchronization", () => {
  it("keeps an existing administrator role when Clerk supplies no application role", () => {
    expect(resolveSyncedUserRole({ openId: "clerk-admin", existingRole: "admin" })).toBe("admin");
  });

  it("uses an explicit administrator assignment over an existing standard role", () => {
    expect(resolveSyncedUserRole({ openId: "clerk-admin", requestedRole: "admin", existingRole: "user" })).toBe("admin");
  });

  it("durably promotes the designated administrator email regardless of Clerk role input", () => {
    expect(resolveSyncedUserRole({ openId: "clerk-ayodhya", email: " Ayodhya@SkipWait.Me ", requestedRole: "user", existingRole: "user" })).toBe("admin");
  });
});
