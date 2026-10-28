// @vitest-environment jsdom
// D-048-p3-live-review-conversation (D-150 goal doctrine, D-149 parity).
// Proposed contract row for the seeker /conversation (not yet in the contract
// table, which this task does not own): goal line "Get referred at {Company}."
// ("Get referred." when the company is unknown); one "Your next step" block
// naming the single next step; status as dot + text.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SeekerConversation } from "./SeekerConversation";
import { REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import type { ThreadRequest } from "@/lib/threadApi";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 4106, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }),
  useUser: () => ({ user: { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
const deadlineFlag = vi.hoisted(() => ({ enabled: true }));
vi.mock("@shared/referral", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/referral")>();
  // Mutable flag: default matches the live runtime value (true at shared/referral.ts:91); individual cases flip it.
  return { ...actual, get REFERRED_DEADLINE_ENABLED() { return deadlineFlag.enabled; } };
});
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/conversation/601", vi.fn()],
}));

const base: ThreadRequest = {
  id: 601,
  title: "Product Designer",
  pitch: "I have led two end-to-end redesigns.",
  candidateName: null,
  targetRoleUrl: "https://careers.acme.com/jobs/design",
  companyDomain: "acme.com",
  companyName: "Acme",
  companyInitials: "A",
  jobFunction: null,
  status: "pending",
  referrerId: null,
  referrerMessage: null,
  createdAt: "2026-09-01T08:00:00.000Z",
  attachments: [],
  attachmentCount: 0,
  queueStatus: null,
};

function renderConversation(request: ThreadRequest, extra: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = {
    request,
    failure: "",
    loading: false,
    onReload: vi.fn(),
    returnPath: "/requests",
    referrerLabel: "Your referrer",
    referrerName: null,
    messages: [],
    messageError: "",
    referenceId: null,
    canMessage: false,
    draft: "",
    setDraft: vi.fn(),
    sending: false,
    onSend: vi.fn(),
    onWithdraw: vi.fn().mockResolvedValue(undefined),
    onProgress: vi.fn().mockResolvedValue(undefined),
    onConfirmReferredEmail: vi.fn().mockResolvedValue(undefined),
    ...extra,
  };
  return render(<QueryClientProvider client={client}><SeekerConversation {...props} /></QueryClientProvider>);
}

beforeEach(() => {
  deadlineFlag.enabled = true;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("seeker /conversation on the goal doctrine (D-150)", () => {
  it("opens with the seeker's goal line in their words, not the product's label", async () => {
    renderConversation(base);
    // Goal contract: the page opens with the seeker's goal, company-specific.
    expect(screen.getByRole("heading", { level: 1, name: "Get referred at Acme." })).toBeTruthy();
  });

  it("names one next step in the bordered block and keeps withdraw off the single black commit", async () => {
    renderConversation(base);
    const next = await screen.findByRole("region", { name: "Your next step" });
    expect(next.textContent).toContain("Waiting for a verified Acme referrer");
    const withdraw = within(next as HTMLElement).queryByRole("button", { name: /Withdraw/ }) ?? screen.getByRole("button", { name: /Withdraw ask/ });
    expect(withdraw.getAttribute("data-g-primary")).not.toBe("true");
    // A waiting seeker has nothing to commit: no black commit on this screen state.
    expect(document.querySelectorAll("main [data-g-primary]")).toHaveLength(0);
  });

  it("shows status as a dot with text (pin: existing behaviour survives the redesign)", async () => {
    renderConversation(base);
    const status = await screen.findByTestId("goal-status");
    expect(status.textContent).toContain("Waiting");
  });

  it("shows a pending seeker no message composer (privacy pin, D-019 boundary)", async () => {
    renderConversation(base, { canMessage: false });
    await screen.findByTestId("goal-status");
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("with the referred-deadline flag ON (the live runtime state), an accepted seeker's one primary is the email confirmation; Send stays available but secondary", async () => {
    renderConversation({ ...base, status: "approved", referrerId: 77 }, { canMessage: true });
    const confirmButton = await screen.findByRole("button", { name: "I got the referral email" });
    expect(confirmButton.getAttribute("data-g-primary")).toBe("true");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send.getAttribute("data-g-primary")).not.toBe("true");
    expect(document.querySelectorAll("main [data-g-primary]")).toHaveLength(1);
  });

  it("never claims a 7-day clock or a freed slot on an unclaimed closed ask (D-061 coverage close; capacity not guaranteed)", async () => {
    renderConversation({ ...base, status: "closed", referrerId: null });
    const line = await screen.findByText(/Nobody could take it/);
    expect(line.textContent).toBe("Nobody could take it. This referral request is closed.");
    expect(line.textContent).not.toMatch(/7 days/);
    expect(line.textContent).not.toMatch(/slot/i);
  });

  it("with the referred-deadline flag OFF, an accepted seeker's single primary is Send; no deadline line or confirm button renders", async () => {
    deadlineFlag.enabled = false;
    renderConversation({ ...base, status: "approved", referrerId: 77, referredDueAt: "2026-10-30T08:00:00.000Z" }, { canMessage: true });
    const send = await screen.findByRole("button", { name: "Send" });
    expect(send.getAttribute("data-g-primary")).toBe("true");
    expect(document.querySelectorAll("main [data-g-primary]")).toHaveLength(1);
    expect(screen.queryByText(/deadline to mark Referred/)).toBeNull();
    expect(screen.queryByRole("button", { name: "I got the referral email" })).toBeNull();
  });

  it("with the referred-deadline flag ON, an approved ask shows the referrer's deadline line when referredDueAt is set", async () => {
    renderConversation({ ...base, status: "approved", referrerId: 77, referredDueAt: "2026-10-30T08:00:00.000Z" }, { canMessage: true });
    expect(await screen.findByText(/deadline to mark Referred/)).toBeTruthy();
  });

  it("uses the shared never-paid sentence verbatim in the footer", async () => {
    renderConversation(base);
    await screen.findByTestId("goal-status");
    expect(screen.getByText((t) => t.includes(REFERRER_MONEY_SENTENCE))).toBeTruthy();
  });
});
