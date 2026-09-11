import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./workosAuth";

// Regression coverage for the OAuth callback redirect target.
//
// The callback used to redirect to `decodeURIComponent(state.slice(7))` whenever
// `state` began with "return=". `state` is round-tripped through the identity
// provider and is attacker-controllable at the callback, so a crafted link sent
// the freshly-authenticated user to any origin the attacker chose.

describe("safeReturnPath", () => {
  it("accepts same-origin absolute paths, including query and fragment", () => {
    expect(safeReturnPath("/dashboard", "/")).toBe("/dashboard");
    expect(safeReturnPath("/requests?tab=open", "/")).toBe("/requests?tab=open");
    expect(safeReturnPath("/inbox#top", "/")).toBe("/inbox#top");
    expect(safeReturnPath("/", "/")).toBe("/");
  });

  it("rejects absolute URLs to another origin", () => {
    expect(safeReturnPath("https://evil.example/phish", "/")).toBe("/");
    expect(safeReturnPath("http://evil.example", "/")).toBe("/");
    expect(safeReturnPath("javascript:alert(1)", "/")).toBe("/");
  });

  it("rejects protocol-relative and backslash variants browsers normalise into hosts", () => {
    expect(safeReturnPath("//evil.example", "/")).toBe("/");
    expect(safeReturnPath("/\\evil.example", "/")).toBe("/");
    expect(safeReturnPath("\\\\evil.example", "/")).toBe("/");
  });

  it("rejects percent-encoded absolute URLs, since the value is decoded first", () => {
    expect(safeReturnPath("https%3A%2F%2Fevil.example", "/")).toBe("/");
    expect(safeReturnPath("%2F%2Fevil.example", "/")).toBe("/");
  });

  it("rejects control characters that could be used to smuggle a header break", () => {
    expect(safeReturnPath("/ok\r\nSet-Cookie: a=b", "/")).toBe("/");
    expect(safeReturnPath("/ok\u0000", "/")).toBe("/");
  });

  it("falls back for missing, empty, or malformed values", () => {
    expect(safeReturnPath(undefined, "/home")).toBe("/home");
    expect(safeReturnPath(null, "/home")).toBe("/home");
    expect(safeReturnPath("", "/home")).toBe("/home");
    expect(safeReturnPath("dashboard", "/home")).toBe("/home");
    // Malformed percent-encoding must not be half-decoded into a redirect.
    expect(safeReturnPath("%E0%A4%A", "/home")).toBe("/home");
  });

  it("sanitises the configured fallback too, so a bad env value cannot redirect off-origin", () => {
    // Mirrors the callback wiring: the fallback is passed through the same guard.
    expect(safeReturnPath(undefined, safeReturnPath("https://evil.example", "/"))).toBe("/");
    expect(safeReturnPath(undefined, safeReturnPath("/settings", "/"))).toBe("/settings");
  });
});
