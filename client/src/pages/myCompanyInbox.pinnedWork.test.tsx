// @vitest-environment jsdom
// Task 13 on the referrer side: the queue's reading pane shows the work the
// seeker pinned at send time, before the accept decision. The snapshot is
// parsed at the fetch boundary (shared/askWorkItems.ts), so an older API
// without the list — or a malformed one — reads as "no pinned work" instead of
// crashing the pane the referrer decides on.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyCompanyInbox from "./MyCompanyInbox";

const Queue = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyCompanyInbox /></QueryClientProvider>;

const { go, getToken } = vi.hoisted(() => ({ go: vi.fn(), getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken }),
  useUser: () => ({ user: { emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] } }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/queue", go], useSearch: () => "" }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "verified", access: { verified: true, domain: "acme.com", companyName: null, companyInitials: null } }) }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div>, LogoMark: () => <div data-skipwait-logo-mark="true" /> }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const inboxItem = { id: 7, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: "Acme", status: "pending", referrerId: null, savedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attachmentCount: 1, isClaimedByYou: false, publicRef: "R-8F3K2" };
const baseRequest = { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [{ id: 1, fileName: "avery-resume.pdf" }], publicRef: "R-8F3K2" };

const WORK_ITEMS = [
  { title: "Checkout redesign", kind: "case_study", source: "Portfolio", url: "https://avery.example.com/checkout" },
  { title: "Design system", kind: "project", source: null, url: null },
  { title: "Scripted link", kind: "other", source: null, url: "javascript:alert(1)" },
];

function stubFetch(previewRequest: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/preview")) return { ok: true, json: async () => ({ request: previewRequest }) };
    if (url.includes("/inbox?scope=new")) return { ok: true, json: async () => ({ requests: [inboxItem] }) };
    if (url.includes("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const openAsk = async () => {
  render(<Queue />);
  fireEvent.click(await screen.findByRole("button", { name: /Private ask/ }));
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("referrer queue: pinned work before accepting", () => {
  it("shows the send-time snapshot in the order the seeker chose it, and only links http(s)", async () => {
    stubFetch({ ...baseRequest, workItems: WORK_ITEMS });
    await openAsk();

    const section = await screen.findByRole("region", { name: "Pinned work" });
    expect(section.textContent).toContain("Checkout redesign");
    expect(section.textContent).toContain("Case study · Portfolio");
    expect(section.textContent).toContain("Design system");
    expect(section.textContent).toContain("Scripted link");
    // Order is the seeker's, not the server's.
    const titles = Array.from(section.querySelectorAll("li")).map(row => row.textContent ?? "");
    expect(titles[0]).toContain("Checkout redesign");
    expect(titles[2]).toContain("Scripted link");
    // A stored scheme that is not http(s) renders as text: never a clickable javascript: URL.
    expect(section.querySelector('a[href^="javascript"]')).toBeNull();
    expect(section.querySelector('a[href="https://avery.example.com/checkout"]')).toBeTruthy();
    expect(section.querySelectorAll("a")).toHaveLength(1);
    // The quality list reads the same snapshot.
    expect(screen.getByText(/Work attached/).textContent).toContain("✓");
  });

  it("reads an older preview without the list as no pinned work, without crashing the pane", async () => {
    stubFetch(baseRequest);
    await openAsk();
    await waitFor(() => expect(screen.getByText(/Why me/)).toBeTruthy());
    expect(screen.queryByRole("region", { name: "Pinned work" })).toBeNull();
    expect(screen.getByText(/Work attached/).textContent).toContain("·");
  });

  it("drops a malformed snapshot instead of taking the decision pane down", async () => {
    stubFetch({ ...baseRequest, workItems: "not-a-list" });
    await openAsk();
    await waitFor(() => expect(screen.getByText(/Why me/)).toBeTruthy());
    expect(screen.queryByRole("region", { name: "Pinned work" })).toBeNull();
    // The decision dock is still there: a broken list never blocks accepting.
    expect(screen.getByRole("button", { name: /Accept & connect/ })).toBeTruthy();
  });
});
