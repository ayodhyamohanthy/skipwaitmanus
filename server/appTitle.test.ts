import { describe, expect, it } from "vitest";

describe("application title configuration", () => {
  it("uses the skipwait.me managed title", () => {
    expect(process.env.VITE_APP_TITLE).toBe("skipwait.me");
  });
});
