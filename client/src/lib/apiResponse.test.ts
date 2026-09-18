import { describe, expect, it } from "vitest";
import { readApiJson } from "./apiResponse";

describe("readApiJson", () => {
  it("returns parsed JSON without throwing the reporter on server failures", async () => {
    const result = await readApiJson<{ ok: boolean }>(new Response(JSON.stringify({ ok: true }), { status: 500 }), "fallback");
    expect(result).toEqual({ ok: true });
  });

  it("throws the fallback message when the body is not JSON", async () => {
    await expect(readApiJson(new Response("<html></html>", { status: 200 }), "fallback")).rejects.toThrow("fallback");
  });
});
