import { describe, expect, it } from "vitest";
import { readApiJson } from "./apiResponse";

describe("API JSON response reading", () => {
  it("returns a JSON object payload unchanged", async () => {
    const payload = await readApiJson(new Response(JSON.stringify({ draft: "A private editable draft." })), "Your draft is unavailable right now.");
    expect(payload).toEqual({ draft: "A private editable draft." });
  });

  it("hides a gateway or sign-in HTML body behind the caller's message", async () => {
    await expect(readApiJson(new Response("<html>Sign in</html>"), "Your draft is unavailable right now.")).rejects.toThrow("Your draft is unavailable right now.");
    await expect(readApiJson(new Response(""), "Your draft is unavailable right now.")).rejects.toThrow("Your draft is unavailable right now.");
  });

  it("refuses a non-object JSON payload that callers would read fields from", async () => {
    await expect(readApiJson(new Response(JSON.stringify([{ draft: "leaked" }])), "Your draft is unavailable right now.")).rejects.toThrow("Your draft is unavailable right now.");
    await expect(readApiJson(new Response(JSON.stringify(null)), "Your draft is unavailable right now.")).rejects.toThrow("Your draft is unavailable right now.");
  });
});
