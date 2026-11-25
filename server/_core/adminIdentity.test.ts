import { afterEach, describe, expect, it, vi } from "vitest";
import { FOUNDER_SUPER_ADMIN_EMAIL, administratorEmails, isAdministratorEmail, isFounderSuperAdmin } from "./adminIdentity";

// D-400 (owner, Nov 25 2026): "super admin access should always be ayodhya@skipwait.me founder only" and "no one can
// takeover the access away from founder anytime". This pin fails if the founder address moves or becomes configurable.
describe("administrator identities (D-400)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("pins the founder as the permanent super administrator", () => {
    expect(FOUNDER_SUPER_ADMIN_EMAIL).toBe("ayodhya@skipwait.me");
    expect(isFounderSuperAdmin(" Ayodhya@SkipWait.me ")).toBe(true);
    expect(isFounderSuperAdmin("admin@skipwait.me")).toBe(false);
  });
  it("keeps the founder whatever SKIPWAIT_ADMIN_EMAIL says, and adds the configured seat", () => {
    for (const seat of ["admin@skipwait.me", "someone.else@example.com", "", "ayodhya@skipwait.me"]) {
      vi.stubEnv("SKIPWAIT_ADMIN_EMAIL", seat);
      expect(administratorEmails()[0]).toBe("ayodhya@skipwait.me");
      expect(isAdministratorEmail("ayodhya@skipwait.me")).toBe(true);
    }
    vi.stubEnv("SKIPWAIT_ADMIN_EMAIL", "admin@skipwait.me");
    expect(administratorEmails()).toEqual(["ayodhya@skipwait.me", "admin@skipwait.me"]);
    expect(isAdministratorEmail("Admin@SkipWait.me")).toBe(true);
  });
  it("a handover moves only the seat: the previous seat holder is no longer an administrator address", () => {
    vi.stubEnv("SKIPWAIT_ADMIN_EMAIL", "next.admin@skipwait.me");
    expect(isAdministratorEmail("admin@skipwait.me")).toBe(false);
    expect(isAdministratorEmail("next.admin@skipwait.me")).toBe(true);
    expect(isAdministratorEmail("ayodhya@skipwait.me")).toBe(true);
    expect(isAdministratorEmail("")).toBe(false);
  });
});
