import { describe, expect, it } from "vitest";
import { resolveSyncedUserRole } from "./db";

describe("Clerk user role synchronization", () => {
  it("keeps an existing administrator role when Clerk supplies no application role", () => {
    expect(resolveSyncedUserRole({ openId: "clerk-admin", existingRole: "admin" })).toBe("admin");
  });

  it("uses an explicit administrator assignment over an existing standard role", () => {
    expect(resolveSyncedUserRole({ openId: "clerk-admin", requestedRole: "admin", existingRole: "user" })).toBe("admin");
  });
});
