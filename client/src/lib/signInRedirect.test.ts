import { afterEach, describe, expect, it, vi } from "vitest";
import { startLogin } from "@/const";
import { signInRedirectTarget } from "./signInRedirect";

function at(path: string) {
  const url = new URL(path, "https://skipwait.me");
  return { pathname: url.pathname, search: url.search, hash: url.hash, origin: url.origin, href: url.href };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("the global unauthorized redirect (D-030, D-049)", () => {
  it.each([
    ["/referrer-home", "/sign-in?intent=referrer&returnTo=%2Freferrer-home"],
    ["/referrer", "/sign-in?intent=referrer&returnTo=%2Freferrer"],
    ["/referrer/impact", "/sign-in?intent=referrer&returnTo=%2Freferrer%2Fimpact"],
    ["/referrer-setup", "/sign-in?intent=referrer&returnTo=%2Freferrer-setup"],
    ["/verify?company=wipro", "/sign-in?intent=referrer&returnTo=%2Fverify%3Fcompany%3Dwipro"],
    ["/queue", "/sign-in?intent=referrer&returnTo=%2Fqueue"],
    ["/post-opportunity", "/sign-in?intent=referrer&returnTo=%2Fpost-opportunity"],
    ["/email-review/abc123", "/sign-in?intent=referrer&returnTo=%2Femail-review%2Fabc123"],
  ])("keeps a referrer on %s on the work-email sign-in", (path, expected) => {
    expect(signInRedirectTarget(at(path))).toBe(expected);
  });

  it.each([
    ["/requests", "/sign-in?returnTo=%2Frequests"],
    ["/plans?role=job_seeker#credits", "/sign-in?returnTo=%2Fplans%3Frole%3Djob_seeker%23credits"],
    ["/inbox", "/sign-in?returnTo=%2Finbox"],
    ["/referrers-guide", "/sign-in?returnTo=%2Freferrers-guide"],
    ["/admin/users", "/sign-in?returnTo=%2Fadmin%2Fusers"],
  ])("sends everyone else on %s to the skipwait.me sign-in", (path, expected) => {
    expect(signInRedirectTarget(at(path))).toBe(expected);
  });

  it.each(["/sign-in", "/sign-in?intent=referrer", "/forgot-password", "/reset-password?token=abc"])("never navigates away from the auth page %s (no loop)", path => {
    expect(signInRedirectTarget(at(path))).toBeNull();
  });

  it("startLogin() navigates from the current location", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { ...at("/referrer-home"), assign } });
    startLogin();
    expect(assign).toHaveBeenCalledWith("/sign-in?intent=referrer&returnTo=%2Freferrer-home");
    vi.stubGlobal("window", { location: { ...at("/requests"), assign } });
    startLogin();
    expect(assign).toHaveBeenLastCalledWith("/sign-in?returnTo=%2Frequests");
  });

  it("startLogin() does nothing on an auth page", () => {
    const assign = vi.fn();
    for (const path of ["/sign-in", "/forgot-password", "/reset-password"]) {
      vi.stubGlobal("window", { location: { ...at(path), assign } });
      startLogin();
    }
    expect(assign).not.toHaveBeenCalled();
  });

  it("startLogin(returnTo) takes an explicit destination", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { ...at("/share"), assign } });
    startLogin("/requests");
    expect(assign).toHaveBeenCalledWith("/sign-in?returnTo=%2Frequests");
  });

  it("never sends anyone to the provider-less WorkOS route", () => {
    for (const path of ["/requests", "/referrer-home", "/plans", "/"]) expect(signInRedirectTarget(at(path)) ?? "").not.toContain("/api/auth/workos");
  });
});
