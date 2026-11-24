// @vitest-environment jsdom
// SEARCH-universal (D-394): the client side of GET /api/search. The answer is
// parsed with the route's own strict schema; the results show the company, the
// title, the locations, the honest presence label and both actions ("Apply on
// the careers site", "Ask for a referral").
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchJobHit, SearchResponse } from "@shared/search";
import { UNIVERSAL_SEARCH_DEBOUNCE_MS, fetchUniversalSearch, isUniversalSearchInvalid, useUniversalSearch } from "./universalSearch";
import { UniversalSearchResults } from "./UniversalSearchResults";

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });

const job = (over: Partial<SearchJobHit> = {}): SearchJobHit => ({
  id: 1,
  companySlug: "acme",
  companyName: "Acme",
  title: "Product Designer",
  locations: ["Remote", "Bengaluru"],
  applyUrl: "https://acme.com/careers/1",
  publishedAt: "2026-11-20T00:00:00.000Z",
  level: 5,
  referrerPresence: "present",
  ...over,
});

const answer = (over: Partial<SearchResponse> = {}): SearchResponse => ({
  kind: "job-title",
  query: "product designer",
  companies: [],
  discovered: [],
  jobLink: null,
  jobs: [],
  catalogState: "ok",
  ...over,
});

const stub = (status: number, body: unknown) => {
  const fetchMock = vi.fn(async () => json(status, body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("fetchUniversalSearch", () => {
  it("parses the route's strict answer", async () => {
    const fetchMock = stub(200, answer({ jobs: [job()] }));
    const result = await fetchUniversalSearch("  product designer  ");
    expect(result.jobs.map(item => item.title)).toEqual(["Product Designer"]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/search?q=product+designer");
  });

  it("marks the route's 400 as invalid input and a 5xx or a dropped connection as retryable", async () => {
    stub(400, { error: "Invalid search" });
    const invalid = await fetchUniversalSearch("x").catch((error: unknown) => error);
    expect(isUniversalSearchInvalid(invalid)).toBe(true);
    stub(503, { error: "down" });
    const failed = await fetchUniversalSearch("x").catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(Error);
    expect(isUniversalSearchInvalid(failed)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    const dropped = await fetchUniversalSearch("x").catch((error: unknown) => error);
    expect(dropped).toBeInstanceOf(Error);
    expect(isUniversalSearchInvalid(dropped)).toBe(false);
  });

  it("refuses a shape the route would not send", async () => {
    stub(200, { ...answer(), jobs: [{ ...job(), applyUrl: "not a url" }] });
    await expect(fetchUniversalSearch("x")).rejects.toThrow();
  });
});

describe("useUniversalSearch", () => {
  it("waits for the debounce, then answers with jobs and the catalog state", async () => {
    const fetchMock = stub(200, answer({ jobs: [job()] }));
    const { result } = renderHook(() => useUniversalSearch("product designer", true), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"), { timeout: UNIVERSAL_SEARCH_DEBOUNCE_MS + 2_000 });
    expect(result.current.jobs.map(item => item.id)).toEqual([1]);
    expect(result.current.catalogState).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends nothing while the switch is off", async () => {
    const fetchMock = stub(200, answer());
    const { result } = renderHook(() => useUniversalSearch("acme", false), { wrapper });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, UNIVERSAL_SEARCH_DEBOUNCE_MS + 100)); });
    expect(result.current.status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("UniversalSearchResults", () => {
  const ready = (over: Partial<SearchResponse> = {}) => ({
    status: "ready" as const, query: "product designer", kind: "job-title" as const,
    suggestions: [], discovered: [], jobLink: null, jobs: [], catalogState: "ok" as const, noMatch: false,
    retry: () => undefined, ...over,
  });

  it("lists a job with its company, locations, presence label and both actions", () => {
    const onOpenJobLink = vi.fn();
    render(<UniversalSearchResults state={ready({ jobs: [job()] })} onOpenCompany={vi.fn()} onOpenJobLink={onOpenJobLink} />);
    expect(screen.getByText("Product Designer")).toBeTruthy();
    expect(screen.getByText("Acme · Remote · Bengaluru")).toBeTruthy();
    expect(screen.getByText("Referrers here")).toBeTruthy();
    const apply = screen.getByRole("link", { name: /Apply on the careers site for Product Designer/ });
    expect(apply.getAttribute("href")).toBe("https://acme.com/careers/1");
    fireEvent.click(screen.getByRole("button", { name: "Ask for a referral" }));
    expect(onOpenJobLink).toHaveBeenCalledWith("acme", "https://acme.com/careers/1");
  });

  it("says 'No referrers yet' when the company has none", () => {
    render(<UniversalSearchResults state={ready({ jobs: [job({ referrerPresence: "none" })] })} onOpenCompany={vi.fn()} onOpenJobLink={vi.fn()} />);
    expect(screen.getByText("No referrers yet")).toBeTruthy();
    expect(screen.queryByText("Referrers here")).toBeNull();
  });

  it("shows a resolved posting with its role, company and both actions", () => {
    const onOpenJobLink = vi.fn();
    render(<UniversalSearchResults
      state={ready({ kind: "job-link", jobLink: { url: "https://boards.greenhouse.io/acme/jobs/123", companySlug: "acme", companyName: "Acme", roleTitle: "Product Designer", employerConfidence: "direct-domain", status: "fresh" } })}
      onOpenCompany={vi.fn()}
      onOpenJobLink={onOpenJobLink}
    />);
    expect(screen.getByText("Product Designer at Acme")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Apply on the careers site/ }).getAttribute("href")).toBe("https://boards.greenhouse.io/acme/jobs/123");
    fireEvent.click(screen.getByRole("button", { name: "Ask for a referral" }));
    expect(onOpenJobLink).toHaveBeenCalledWith("acme", "https://boards.greenhouse.io/acme/jobs/123");
  });

  it("offers the invite path when the posting's company has no door yet", () => {
    render(<UniversalSearchResults
      state={ready({ kind: "job-link", jobLink: { url: "https://boards.greenhouse.io/zeta/jobs/1", companySlug: null, companyName: null, roleTitle: "Engineer", employerConfidence: "ambiguous", status: "fresh" } })}
      onOpenCompany={vi.fn()}
      onOpenJobLink={vi.fn()}
    />);
    expect(screen.queryByRole("button", { name: "Ask for a referral" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ask us to open the door" }).getAttribute("href")).toBe("/invite");
  });

  it("renders nothing when the answer has no result of its own", () => {
    const { container } = render(<UniversalSearchResults state={ready()} onOpenCompany={vi.fn()} onOpenJobLink={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
