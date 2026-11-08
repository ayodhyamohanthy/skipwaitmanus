import { describe, expect, it, vi } from "vitest";

vi.mock("../jobLinkPreview", () => ({
  pinnedDispatcher: vi.fn(async () => {
    throw new Error("DNS pin refused: private address");
  }),
}));

import { fetchGuardedJson } from "./fetch";

describe("guarded board fetch failure taxonomy (PR #650 review finding)", () => {
  it("a DNS-pin rejection is unsafe_destination, not a generic network_error", async () => {
    const res = await fetchGuardedJson("https://boards-api.greenhouse.io/v1/boards/x/jobs?content=true", {
      allowedHost: "boards-api.greenhouse.io",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unsafe_destination");
  });
});
