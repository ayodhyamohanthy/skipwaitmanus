// @vitest-environment jsdom
// Queue task 13, referrer half: the pre-acceptance preview shows the work the
// seeker pinned to this ask. It is the send-time snapshot, it appears only when
// there is something to show, and only an http(s) link becomes clickable.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyCompanyInbox from "./MyCompanyInbox";

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

const ATTACHMENT = { id: 1, fileName: "avery-resume.pdf", mimeType: "application/pdf", fileSize: 1200, url: "/api/files/1" };
const CASE_STUDY = { title: "Led the approvals redesign", kind: "case_study", source: null, url: "https://example.com/approvals" };
const CODE = { title: "Shipped the mobile PWA", kind: "code", source: "GitHub", url: "https://github.com/example/pwa" };
const previewWith = (workItems: unknown) => ({ request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [ATTACHMENT], workItems } });
const inboxItem = { id: 7, targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", status: "pending", referrerId: null, savedAt: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z", attachmentCount: 1, unreadMessageCount: 0 };
const credits = { summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-08", subscriptionStatus: null, subscriptionCurrentTermEnd: null } };

function stubFetch(preview: unknown) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/preview")) return { ok: true, json: async () => preview };
    if (String(url).includes("/inbox?scope=new")) return { ok: true, json: async () => ({ requests: [inboxItem] }) };
    if (String(url).includes("/inbox")) return { ok: true, json: async () => ({ requests: [] }) };
    if (String(url).includes("/credits/summary")) return { ok: true, json: async () => credits };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openPreview() {
  render(<MyCompanyInbox />);
  fireEvent.click(await screen.findByRole("button", { name: "Open request" }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Referrer preview pinned work", () => {
  it("shows the pinned work with its kind, source and link", async () => {
    stubFetch(previewWith([CASE_STUDY, CODE]));
    await openPreview();
    const section = await screen.findByRole("region", { name: "Pinned work" });
    expect(screen.getByText("2 attached")).toBeTruthy();
    expect(section.textContent).toContain("Led the approvals redesign");
    expect(section.textContent).toContain("Shipped the mobile PWA");
    expect(section.textContent).toContain("Code · GitHub");
    expect(screen.getByRole("button", { name: "Accept & submit referral" })).toBeTruthy();
    const links = within(section).getAllByRole("link");
    expect(links).toHaveLength(4); // title + Open per piece
    expect(links.every(link => link.getAttribute("rel")?.includes("noopener"))).toBe(true);
    expect(within(section).getByRole("link", { name: "Shipped the mobile PWA" }).getAttribute("href")).toBe("https://github.com/example/pwa");
  });

  it("never turns a non-http link into something a referrer can click", async () => {
    stubFetch(previewWith([{ ...CASE_STUDY, url: "javascript:alert(1)" }, { ...CODE, url: null }]));
    await openPreview();
    await screen.findByRole("region", { name: "Pinned work" });
    expect(screen.queryByRole("link", { name: "Led the approvals redesign" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Shipped the mobile PWA" })).toBeNull();
    expect(screen.getByText("Led the approvals redesign").closest("li")?.textContent).toContain("Case study");
  });

  it("hides the section when the ask carried no pinned work", async () => {
    stubFetch(previewWith([]));
    await openPreview();
    await screen.findByText("I led a measurable product design launch.");
    expect(screen.queryByRole("region", { name: "Pinned work" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accept & submit referral" })).toBeTruthy();
  });

  it("still opens the preview when the API predates pinned work entirely", async () => {
    const preview = { request: { id: 7, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [ATTACHMENT] } };
    stubFetch(preview);
    await openPreview();
    await screen.findByText("I led a measurable product design launch.");
    expect(screen.queryByRole("region", { name: "Pinned work" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    // The rest of the card is intact: the note, the documents, the decision.
    expect(screen.getByText("Resume & documents")).toBeTruthy();
    expect(screen.getByText("avery-resume.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not a fit" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Confirm decline" })).toBeTruthy());
  });

  it("drops a malformed pinned-work entry instead of half-rendering the list", async () => {
    stubFetch(previewWith([{ title: "Only a title" }]));
    await openPreview();
    await screen.findByText("I led a measurable product design launch.");
    expect(screen.queryByRole("region", { name: "Pinned work" })).toBeNull();
    expect(screen.queryByText("Only a title")).toBeNull();
  });
});
