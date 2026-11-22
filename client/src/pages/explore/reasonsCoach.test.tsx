// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REASONS_COACH_HELP, REASONS_COACH_LABEL, type ReasonsCoachResponse } from "@shared/reasonsCoach";
import { ReasonsCoach } from "./ReasonsCoach";
import type { WhyMeReasons } from "@shared/whyMe";

const feature = vi.hoisted(() => ({ enabled: false }));
vi.mock("@shared/reasonsCoach", async importOriginal => ({
  ...await importOriginal<typeof import("@shared/reasonsCoach")>(),
  get REASONS_COACH_ENABLED() { return feature.enabled; },
}));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ getToken: async () => "synthetic-token" }) }));
vi.mock("@/lib/sentry", () => ({ captureClientError: vi.fn() }));
const reasons: WhyMeReasons = ["I improved the workflow.", "I know the product.", "I work with designers."];
const response = (questions: ReasonsCoachResponse["questions"], status = 200) => new Response(JSON.stringify({ questions }), { status });
const fetchMock = vi.fn<typeof fetch>();
function view(value: WhyMeReasons = reasons, signedIn = true) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <ReasonsCoach reasons={value} signedIn={signedIn} roleTitle="Designer" companyName="Acme" />
  </QueryClientProvider>;
}
beforeEach(() => { feature.enabled = false; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReasonsCoach (D-094)", () => {
  it("renders no control or request with the shipped switch off, or while signed out", () => {
    const { rerender } = render(view());
    expect(screen.queryByRole("button", { name: "Sharpen this" })).toBeNull();
    feature.enabled = true;
    rerender(view(reasons, false));
    expect(screen.queryByRole("button", { name: "Sharpen this" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("asks only after a press, labels the questions and never changes the input", async () => {
    feature.enabled = true;
    fetchMock.mockResolvedValue(response(["Which result did you get there?"]));
    const before = [...reasons];
    render(view());
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sharpen this" }));
    expect(await screen.findByText("Which result did you get there?")).toBeTruthy();
    expect(screen.getByText(REASONS_COACH_LABEL)).toBeTruthy();
    expect(reasons).toEqual(before);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/ask/reasons-coach");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(init?.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer synthetic-token" });
    expect(JSON.parse(String(init?.body))).toEqual({ reasons: [...reasons], roleTitle: "Designer", companyName: "Acme" });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss coaching" }));
    await waitFor(() => expect(screen.queryByText(REASONS_COACH_LABEL)).toBeNull());
  });
  it.each(["empty", "network", "http", "malformed"] as const)("keeps today's help when the result is %s", async kind => {
    feature.enabled = true;
    if (kind === "network") fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    else if (kind === "http") fetchMock.mockResolvedValue(response([], 503));
    else if (kind === "malformed") fetchMock.mockResolvedValue(new Response(JSON.stringify({ questions: ["A statement"] })));
    else fetchMock.mockResolvedValue(response([]));
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Sharpen this" }));
    expect(await screen.findByText(REASONS_COACH_HELP)).toBeTruthy();
    expect(screen.queryByText(REASONS_COACH_LABEL)).toBeNull();
  });
  it("does not publish a response for reasons that have changed", async () => {
    feature.enabled = true;
    let finish: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Sharpen this" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender(view(["I wrote a new reason.", reasons[1], reasons[2]]));
    finish?.(response(["Which result did you get there?"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sharpen this" }).getAttribute("aria-busy")).not.toBe("true"));
    expect(screen.queryByText("Which result did you get there?")).toBeNull();
  });
});
