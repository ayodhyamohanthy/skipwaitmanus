// @vitest-environment jsdom
// D-086.admit (packet §5.5): the admin admission queue is strictly read-only.
// It shows what the server already returns — an unlisted domain and how many
// people are asking there — and nothing that creates, lists or pre-fills a
// company. Listing stays a manual authenticated POST /api/admin/companies.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnlistedDemandView } from "./UnlistedDemandView";

const { authState } = vi.hoisted(() => ({ authState: { isSignedIn: true } }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken: async () => (authState.isSignedIn ? "admin-token" : null) }),
}));

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });

function stub(reply: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => json(reply.status, reply.body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderView = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UnlistedDemandView /></QueryClientProvider>);
const queue = (domains: { domain: string; people: number }[]) => ({ status: 200, body: { domains } });

beforeEach(() => {
  authState.isSignedIn = true;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("unlisted demand queue (D-086.admit)", () => {
  it("lists each unlisted domain with the number of people asking", async () => {
    const fetchMock = stub(queue([{ domain: "acme-robotics.example", people: 7 }, { domain: "northwind.example", people: 2 }]));
    renderView();
    expect(await screen.findByText("acme-robotics.example")).toBeTruthy();
    expect(screen.getByText("northwind.example")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("To list a company, an admin sends an authenticated POST to /api/admin/companies.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/company-demand/unlisted");
  });

  it("shows the empty state when nobody is asking at an unlisted domain", async () => {
    stub(queue([]));
    renderView();
    expect(await screen.findByText("No unlisted companies with requests")).toBeTruthy();
  });

  it("says the queue is not switched on when the server answers 404", async () => {
    stub({ status: 404, body: { error: "Not found" } });
    renderView();
    expect(await screen.findByText("Not switched on yet")).toBeTruthy();
    expect(screen.queryByText("Couldn't load the queue")).toBeNull();
  });

  it("shows a plain failure and a retry for any other answer", async () => {
    stub({ status: 500, body: { error: "Something went wrong on our side" } });
    renderView();
    expect(await screen.findByText("Couldn't load the queue")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows a loading state before the answer arrives", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetchMock = vi.fn(async () => { await gate; return json(200, { domains: [] }); });
    vi.stubGlobal("fetch", fetchMock);
    renderView();
    expect(screen.getByText("Loading the unlisted queue…")).toBeTruthy();
    release?.();
    expect(await screen.findByText("No unlisted companies with requests")).toBeTruthy();
  });

  it("renders domains as text, never as links", async () => {
    stub(queue([{ domain: "acme-robotics.example", people: 3 }]));
    const { container } = renderView();
    await screen.findByText("acme-robotics.example");
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("offers no form, input, or control that creates or lists a company", async () => {
    stub(queue([{ domain: "acme-robotics.example", people: 3 }]));
    const { container } = renderView();
    await screen.findByText("acme-robotics.example");
    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(0);
    // The only permitted control anywhere in the view is the error retry.
    expect(within(container).queryAllByRole("button")).toHaveLength(0);
    expect(within(container).queryAllByRole("link")).toHaveLength(0);
  });

  it("sends nothing but its one GET", async () => {
    const fetchMock = stub(queue([{ domain: "acme-robotics.example", people: 3 }]));
    renderView();
    await screen.findByText("acme-robotics.example");
    for (const call of fetchMock.mock.calls) {
      const init = (call as unknown as [string, RequestInit | undefined])[1];
      expect(init?.method ?? "GET").toBe("GET");
    }
  });

  it("never reads or shows an identity field, even when a payload carries one", async () => {
    // The contract is a strict object of { domain, people }: anything extra is a
    // contract breach, so the view refuses the payload instead of rendering it.
    stub({ status: 200, body: { domains: [{ domain: "acme-robotics.example", people: 3, name: "Ada Byron", email: "ada@example.com" }] } });
    const { container } = renderView();
    await waitFor(() => expect(screen.getByText("Couldn't load the queue")).toBeTruthy());
    expect(container.textContent).not.toContain("Ada Byron");
    expect(container.textContent).not.toContain("ada@example.com");
  });

// D-328: the visible mount is the goal /admin overview, not the legacy
// companies view (that view never renders while `admin` is in RELEASED). The
// page keeps exactly one h1 and one next step; the queue is a section below.
it("mounts as a section on the goal /admin overview without a second h1 or next step", async () => {
  stub(queue([{ domain: "acme-robotics.example", people: 5 }]));
  const GoalAdminOverview = (await import("@/pages/goal/admin/GoalAdminOverview")).default;
  const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GoalAdminOverview /></QueryClientProvider>);
  expect(await screen.findByText("acme-robotics.example")).toBeTruthy();
  expect(screen.getByText("Requests for unlisted companies")).toBeTruthy();
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  // The section sits outside the page's one next-step block; the block itself and
  // its single black commit are pinned by admin.goal.test.tsx.
  const section = container.querySelector('[aria-labelledby="unlisted-demand"]');
  expect(section).toBeTruthy();
  expect(container.querySelector('[aria-label="Your next step"] [aria-labelledby="unlisted-demand"]')).toBeNull();
});

  it("retries the read when the admin asks again", async () => {
    // adminRetry allows one automatic retry, so the button appears after two failures.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(500, { error: "Something went wrong on our side" }))
      .mockResolvedValueOnce(json(500, { error: "Something went wrong on our side" }))
      .mockResolvedValueOnce(json(200, { domains: [{ domain: "acme-robotics.example", people: 3 }] }));
    vi.stubGlobal("fetch", fetchMock);
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("acme-robotics.example")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
