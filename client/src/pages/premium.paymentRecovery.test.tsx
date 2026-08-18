// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Premium from "./Premium";

vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("clerk-token") }), useClerk: () => ({ openSignIn: vi.fn() }) }));

describe("Premium payment return recovery", () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals(); });

  it("shows credits only after the signed-in server recovery confirms a matching provider payment", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker&payment=pending");
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp_recovery", role: "job_seeker" }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("credit-recovery")) return new Response(JSON.stringify({ status: "credited", tokenCount: 5, summary: { totalAvailable: 8 } }), { status: 200 });
      return new Response(JSON.stringify({ summary: { totalAvailable: 3 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Premium />);
    expect(await screen.findByText("5 referral credits are ready.")).toBeTruthy();
    expect(screen.getByText("Your verified payment is complete and your available credits are updated.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/credit-recovery", expect.objectContaining({ method: "POST" }));
  });
});
