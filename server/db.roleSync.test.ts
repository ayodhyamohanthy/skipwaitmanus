import { describe, expect, it } from "vitest";
import { resolveSyncedUserRole } from "./db";

describe("identity provider user role synchronization", () => {
  it("keeps an existing administrator role when the provider supplies no application role", () => {
    expect(resolveSyncedUserRole({ openId: "workos-admin", existingRole: "admin" })).toBe("admin");
  });

  it("uses an explicit administrator assignment over an existing standard role", () => {
    expect(resolveSyncedUserRole({ openId: "workos-admin", requestedRole: "admin", existingRole: "user" })).toBe("admin");
  });

  it("durably promotes the designated administrator email regardless of provider role input", () => {
    expect(resolveSyncedUserRole({ openId: "workos-ayodhya", email: " Ayodhya@SkipWait.Me ", requestedRole: "user", existingRole: "user" })).toBe("admin");
  });
});
