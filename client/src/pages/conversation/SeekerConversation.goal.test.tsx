// @vitest-environment jsdom
// D-048-p3-live-review-conversation (D-150 goal doctrine, D-149 parity).
// Proposed contract row for the seeker /conversation (not yet in the contract
// table, which this task does not own): goal line "Get referred at {Company}."
// ("Get referred." when the company is unknown); one "Your next step" block
// naming the single next step; status as dot + text.
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SeekerConversation } from "./SeekerConversation";
import { REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import {
  CLOSED_UNCLAIMED_LINE,
  DECLINED_LINE,
  SUPPORTING_COPY_FORBIDDEN,
  WITHDRAWN_LINE,
  WITHDRAW_CONFIRM_AWAITING,
  WITHDRAW_CONFIRM_VISIBLE,
  seekerTerminalLine,
  withdrawConfirmLine,
} from "@shared/conversationCopy";
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
    expect(line.textContent).toBe(CLOSED_UNCLAIMED_LINE);
    expect(line.textContent).not.toMatch(/7 days/);
    expect(line.textContent).not.toMatch(/slot/i);
  });

  it("uses the shared never-paid sentence verbatim in the footer", async () => {
    renderConversation(base);
    await screen.findByTestId("goal-status");
    expect(screen.getByText((t) => t.includes(REFERRER_MONEY_SENTENCE))).toBeTruthy();
  });
});

// F1 (D-180-conversation-copy, amended Oct 28): the terminal and withdraw-confirm
// lines come from `shared/conversationCopy.ts`, never retyped here, and their
// supporting copy carries no amount, refund outcome, expiry clock, slot or
// availability claim.
describe("seeker /conversation terminal and withdraw-confirm copy come from the frozen helper (D-180)", () => {
  const reasonOf = (region: HTMLElement) => region.querySelector("p")?.textContent ?? "";
  const nextStep = () => screen.getByRole("region", { name: "Your next step" });
  const expectNoForbidden = (copy: string) => {
    for (const pattern of SUPPORTING_COPY_FORBIDDEN) expect(copy).not.toMatch(pattern);
  };

  it("declined: the next-step reason is the helper's line, verbatim and forbidden-pattern clean", async () => {
    renderConversation({ ...base, status: "declined", referrerId: 77 });
    const reason = reasonOf(await nextStep());
    expect(reason).toBe(DECLINED_LINE);
    expect(reason).toBe(seekerTerminalLine("declined", { claimed: true }));
    expectNoForbidden(reason);
  });

  it("withdrawn: the next-step reason is the helper's line, verbatim and forbidden-pattern clean", async () => {
    renderConversation({ ...base, status: "withdrawn", referrerId: 77 });
    const reason = reasonOf(await nextStep());
    expect(reason).toBe(WITHDRAWN_LINE);
    expect(reason).toBe(seekerTerminalLine("withdrawn", { claimed: true }));
    expectNoForbidden(reason);
  });

  it("a claimed close (Hired) renders no terminal line, matching the helper's null", async () => {
    renderConversation({ ...base, status: "closed", referrerId: 77 }, { canMessage: true });
    await screen.findByTestId("goal-status");
    expect(seekerTerminalLine("closed", { claimed: true })).toBeNull();
    expect(screen.queryByText(CLOSED_UNCLAIMED_LINE)).toBeNull();
  });

  it("withdraw confirm on a request that never reached an employee uses the helper's awaiting line", async () => {
    renderConversation({ ...base, referrerId: 77, queueStatus: "waiting_for_coverage", unclaimedAssignment: true });
    fireEvent.click(await screen.findByRole("button", { name: /Withdraw ask/ }));
    const group = await screen.findByRole("group", { name: "Withdraw this ask" });
    const copy = group.querySelectorAll("p")[1].textContent ?? "";
    expect(copy).toBe(WITHDRAW_CONFIRM_AWAITING);
    expect(copy).toBe(withdrawConfirmLine("waiting_for_coverage"));
    expectNoForbidden(copy);
  });

  it("withdraw confirm on a request an employee can see uses the helper's visible line", async () => {
    renderConversation({ ...base, referrerId: 77, queueStatus: "available_for_review", unclaimedAssignment: true });
    fireEvent.click(await screen.findByRole("button", { name: /Withdraw ask/ }));
    const group = await screen.findByRole("group", { name: "Withdraw this ask" });
    const copy = group.querySelectorAll("p")[1].textContent ?? "";
    expect(copy).toBe(WITHDRAW_CONFIRM_VISIBLE);
    expect(copy).toBe(withdrawConfirmLine("available_for_review"));
    expectNoForbidden(copy);
  });
});

// F4: the fixture half of the evidence the packet asks for. The fixtures are
// fictional, schema-shaped and carry no comp sample name. The pixel half for the
// new states is still owed: this host cannot boot the dev server or build the
// client (see the row's status line), so no capture is claimed here.
describe("seeker /conversation fixture evidence (packet item 4)", () => {
  const root = path.resolve(__dirname, "../../../../design/goal-ui");
  const fixtures = fs.readdirSync(path.join(root, "tools/fixtures")).filter(name => name.startsWith("conversation__"));
  const STATUSES = ["pending", "approved", "intro_made", "interview", "offer", "closed", "declined", "withdrawn"];

  it("ships one schema-shaped fixture per state, and none retypes a comp sample name", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(9);
    for (const name of fixtures) {
      const raw = fs.readFileSync(path.join(root, "tools/fixtures", name), "utf8");
      expect(raw, name).not.toMatch(/kestrel/i);
      const doc = JSON.parse(raw) as { route?: string; routes?: { path: string; body?: { requests?: Record<string, unknown>[] } }[] };
      expect(doc.route, name).toBe("/conversation/601");
      const mine = doc.routes?.find(route => route.path === "/api/company-referrals/mine");
      if (!mine) continue; // signed-out fixture: no seeker rows to shape
      const request = mine.body?.requests?.[0];
      expect(request, name).toBeTruthy();
      expect(typeof request!.id, name).toBe("number");
      expect(STATUSES, name).toContain(request!.status);
      expect(typeof request!.companyDomain, name).toBe("string");
    }
  });

  it("covers every state this row changes or depends on", () => {
    for (const state of ["accepted", "no-name", "closed", "waiting", "declined", "withdrawn", "held", "intro", "hired"]) {
      expect(fixtures).toContain(`conversation__${state}.json`);
    }
  });
});

// F2 (D-150, D-149 (2)): one black commit per screen, and it lives inside the
// "Your next step" block. A state with nothing for the seeker to commit records
// that as a conscious drop in the contract row instead of borrowing the
// composer's Send as a fake primary.
describe("seeker /conversation holds its one black commit inside the next-step block (D-150)", () => {
  const primaries = () => Array.from(document.querySelectorAll<HTMLElement>("main [data-g-primary]"));
  const nextStep = () => screen.getByRole("region", { name: "Your next step" });

  it("approved with the email confirmation open: Confirm is the one primary and it sits in the block", async () => {
    renderConversation({ ...base, status: "approved", referrerId: 77 }, { canMessage: true });
    fireEvent.click(await screen.findByRole("button", { name: "I got the referral email" }));
    const confirm = await screen.findByRole("button", { name: "Confirm" });
    expect(confirm.getAttribute("data-g-primary")).toBe("true");
    expect(nextStep().contains(confirm)).toBe(true);
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("data-g-primary")).not.toBe("true");
    expect(primaries()).toHaveLength(1);
  });

  it("intro_made: the immediate next milestone is the block's one primary, and Send stays secondary", async () => {
    renderConversation({ ...base, status: "intro_made", referrerId: 77 }, { canMessage: true });
    const mark = await screen.findByRole("button", { name: "Mark Interviewing" });
    expect(mark.getAttribute("data-g-primary")).toBe("true");
    expect(nextStep().contains(mark)).toBe(true);
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("data-g-primary")).not.toBe("true");
    expect(primaries()).toHaveLength(1);
  });

  it("interview and offer: each promotes only its own immediate milestone into the block", async () => {
    const { unmount } = renderConversation({ ...base, status: "interview", referrerId: 77 }, { canMessage: true });
    const markOffer = await screen.findByRole("button", { name: "Mark Offer" });
    expect(markOffer.getAttribute("data-g-primary")).toBe("true");
    expect(nextStep().contains(markOffer)).toBe(true);
    expect(screen.queryByRole("button", { name: "Mark Hired" })?.getAttribute("data-g-primary")).not.toBe("true");
    expect(primaries()).toHaveLength(1);
    unmount();
    renderConversation({ ...base, status: "offer", referrerId: 77 }, { canMessage: true });
    const markHired = await screen.findByRole("button", { name: "Mark Hired" });
    expect(markHired.getAttribute("data-g-primary")).toBe("true");
    expect(nextStep().contains(markHired)).toBe(true);
    expect(primaries()).toHaveLength(1);
  });

  it("declined: Find another referrer is the block's one primary", async () => {
    renderConversation({ ...base, status: "declined", referrerId: 77 });
    const find = await screen.findByRole("link", { name: "Find another referrer" });
    expect(find.getAttribute("data-g-primary")).toBe("true");
    expect(nextStep().contains(find)).toBe(true);
    expect(primaries()).toHaveLength(1);
  });

  // Recorded drops (D-149 (2)): no seeker commitment exists in these states, so
  // the screen carries no black commit rather than promoting the composer's Send.
  it("pending: nothing for the seeker to commit, and Send is never promoted to primary", async () => {
    renderConversation({ ...base, status: "pending", referrerId: 77, unclaimedAssignment: true }, { canMessage: true });
    await screen.findByTestId("goal-status");
    expect(primaries()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Send" }).getAttribute("data-g-primary")).not.toBe("true");
  });

  it("approved with the referred-deadline flag OFF: the referrer acts, so the seeker's screen has no primary", async () => {
    deadlineFlag.enabled = false;
    renderConversation({ ...base, status: "approved", referrerId: 77, referredDueAt: "2026-10-30T08:00:00.000Z" }, { canMessage: true });
    const send = await screen.findByRole("button", { name: "Send" });
    expect(send.getAttribute("data-g-primary")).not.toBe("true");
    expect(primaries()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "I got the referral email" })).toBeNull();
  });

  it("Hired: the thank-you is a destination, not a commitment, so no primary is promoted", async () => {
    renderConversation({ ...base, status: "closed", referrerId: 77 }, { canMessage: true });
    await screen.findByTestId("goal-status");
    expect(primaries()).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Thank/ })).toBeTruthy();
  });
});

