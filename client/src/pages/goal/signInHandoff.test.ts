import { describe, expect, it } from "vitest";
import { seekerSignInUrl } from "./signInHandoff";

describe("seeker sign-in hand-off", () => {
  it("sends the seeker through job-seeker sign-in and back to /ask, never through /sign-in", () => {
    expect(seekerSignInUrl("/ask")).toBe("/api/auth/workos/sign-in?returnTo=%2Fask");
  });
});
