import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSyncedUserRole } from "./db";

describe("identity provider user role synchronization", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("keeps an existing administrator role when the provider supplies no application role", () => {
    expect(resolveSyncedUserRole({ openId: "workos-admin", existingRole: "admin" })).toBe("admin");
  });

  it("uses an explicit administrator assignment over an existing standard role", () => {
    expect(resolveSyncedUserRole({ openId: "workos-admin", requestedRole: "admin", existingRole: "user" })).toBe("admin");
  });

  // D-400 (owner, Nov 25 2026): the founder is the permanent super administrator; SKIPWAIT_ADMIN_EMAIL is the delegable seat.
  it("always promotes the founder, whatever the provider or the configured seat says", () => {
    for (const seat of ["admin@skipwait.me", "someone.else@example.com", ""]) {
      vi.stubEnv("SKIPWAIT_ADMIN_EMAIL", seat);
      expect(resolveSyncedUserRole({ openId: "workos-ayodhya", email: " Ayodhya@SkipWait.me ", loginMethod: "workos", requestedRole: "user", existingRole: "user" })).toBe("admin");
    }
  });
  it("promotes the configured administrator seat", () => {
    vi.stubEnv("SKIPWAIT_ADMIN_EMAIL", "admin@skipwait.me");
    expect(resolveSyncedUserRole({ openId: "workos-admin-mailbox", email: " Admin@SkipWait.me ", loginMethod: "workos", requestedRole: "user", existingRole: "user" })).toBe("admin");
  });
  it("after a handover the previous seat is not promoted on a fresh row", () => {
    vi.stubEnv("SKIPWAIT_ADMIN_EMAIL", "next.admin@skipwait.me");
    expect(resolveSyncedUserRole({ openId: "workos-admin-mailbox", email: "admin@skipwait.me", loginMethod: "workos", existingRole: "user" })).toBe("user");
  });
  it("never promotes a self-asserted development address",()=>{expect(resolveSyncedUserRole({openId:"dev-admin",email:"admin@skipwait.me",loginMethod:"dev",existingRole:"user"})).toBe("user")});

  it("rejects other provider-verified addresses on the same domain",()=>{expect(resolveSyncedUserRole({openId:"workos-other",email:"someone@skipwait.me",loginMethod:"workos",existingRole:"user"})).toBe("user")});
});
