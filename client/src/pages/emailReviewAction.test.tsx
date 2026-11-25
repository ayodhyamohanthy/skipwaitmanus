// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import { GOAL_PAGE } from "./goal/email-review/GoalEmailReviewAction";
import EmailReviewAction from "./EmailReviewAction";

const { authState, go } = vi.hoisted(() => ({
  authState: { signedIn: true },
  go: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.signedIn, getToken: vi.fn().mockResolvedValue("test-token") }),
}));
vi.mock("wouter", () => ({
  useRoute: () => [true, { linkToken: "a".repeat(48) }],
  useLocation: () => ["/email-review", go],
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

beforeEach(() => { authState.signedIn = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); });

describe("EmailReviewAction decision safety", () => {
  it("opens through GET and requires the official-process confirmation before accepting", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => String(input).endsWith("/decision")
      ? ok({ status: "approved" })
      : ok({ review: { ready: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<EmailReviewAction />);
    expect(await screen.findByText("PRIVATE REVIEW")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(GOAL_PAGE.goalLine);
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({ method: "POST" });

    const accept = screen.getByRole("button", { name: "Accept & connect" });
    expect(accept.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(accept);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(/I’ll refer only through my company’s official process/));
    fireEvent.click(screen.getByRole("button", { name: "Accept & connect" }));

    expect(await screen.findByText("Request accepted.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ decision: "approved", ethicsConfirmed: true }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Open My Company Inbox" }));
    expect(go).toHaveBeenCalledWith("/inbox");
  });

  it("records the selected decline as a private pass and keeps the request open", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => String(input).endsWith("/decision")
      ? ok({ status: "passed", declineReason: "timing" })
      : ok({ review: { ready: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<EmailReviewAction />);
    expect(await screen.findByRole("button", { name: "Decline - not now" })).toBeTruthy();
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    fireEvent.click(screen.getByRole("button", { name: "Decline - not now" }));
    expect(await screen.findByText("Passed")).toBeTruthy();
    expect(screen.getByText("This referral request remains open to other verified colleagues.")).toBeTruthy();
    expect(screen.queryByText("Request declined.")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ decision: "declined", declineReason: "timing" }),
    });
  });
});
