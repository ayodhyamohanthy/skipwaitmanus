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
    expect(resolveSyncedUserRole({ openId: "workos-ayodhya", email: " Ayodhya@SkipWait.Me ", loginMethod: "workos", requestedRole: "user", existingRole: "user" })).toBe("admin");
  });
  it("never promotes a self-asserted development address",()=>{expect(resolveSyncedUserRole({openId:"dev-ayodhya",email:"ayodhya@skipwait.me",loginMethod:"dev",existingRole:"user"})).toBe("user")});

  it("rejects other provider-verified addresses on the same domain",()=>{expect(resolveSyncedUserRole({openId:"workos-other",email:"someone@skipwait.me",loginMethod:"workos",existingRole:"user"})).toBe("user")});
});
