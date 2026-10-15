// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_PERSONAL_NOTE_TEXT } from "@shared/askNote";
import MyCompanyInbox from "./MyCompanyInbox";

/*
 * The queue card's preview (GET /api/company-referrals/:id/preview) is parsed
 * with the shared contract (shared/referrerAskView.ts) before it renders: a
 * payload that does not match is a plain error, never a blank card, and the
 * fields the server may send as null render sensibly.
 */

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

const inboxItem = { id: 7, targetRoleUrl: null, companyDomain: "acme.com", status: "pending", referrerId: null, savedAt: null, createdAt: "2026-08-10T08:00:00.000Z", updatedAt: "2026-08-10T08:00:00.000Z", attachmentCount: 1, unreadMessageCount: 0 };

function stubPreview(preview: object) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes("/preview") ? preview : url.includes("/inbox?scope=new") ? { requests: [inboxItem] } : { requests: [] }),
  })));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("queue preview contract", () => {
  it("shows a plain error, not an empty card, when the preview does not match the contract", async () => {
    stubPreview({ request: { id: "seven", attachments: "resume.pdf" } });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Open request" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not read this private candidate preview");
    expect(screen.queryByRole("article", { name: "Candidate preview" })).toBeNull();
  });

  it("treats a missing preview as an error too", async () => {
    stubPreview({});
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Open request" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not read this private candidate preview");
  });

  it("renders a preview whose note and company domain arrive as null", async () => {
    stubPreview({ request: { id: 7, title: null, targetRoleUrl: null, companyDomain: null, jobFunction: null, candidateMessage: null, attachments: [{ mimeType: "application/pdf", fileSize: 10, availability: "after_claim" }] } });
    render(<MyCompanyInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Open request" }));
    expect(await screen.findByRole("article", { name: "Candidate preview" })).toBeTruthy();
    expect(screen.getByText(NO_PERSONAL_NOTE_TEXT)).toBeTruthy();
    expect(screen.getByText("1 attached")).toBeTruthy();
    expect(screen.getByText("Resume ready after acceptance")).toBeTruthy();
    expect(screen.queryByText(/null/)).toBeNull();
    expect(screen.getByRole("button", { name: "Accept & submit referral" })).toBeTruthy();
  });
});
