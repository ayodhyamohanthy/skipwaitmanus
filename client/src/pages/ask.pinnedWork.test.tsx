// @vitest-environment jsdom
// Queue task 13, client half: the /ask composer shows the seeker's own showcase
// pieces as the work a referrer sees before accepting. The picker preselects what
// they already pin, sends ids only when there is a selection, and recovers from
// the server's plan-limit refusal instead of dead-ending on it.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ask from "./Ask";

const { authState } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true, userId: 7, getToken: vi.fn().mockResolvedValue("test-token") } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", vi.fn()],
}));

beforeEach(() => { authState.isLoaded = true; authState.isSignedIn = true; sessionStorage.clear(); window.history.replaceState(null, "", "/ask"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });
const NOTE = "I've led two end-to-end redesigns of enterprise approval workflows, cutting task time by 40% for 3000 users over 4 years. This Product Designer role focuses on the same problem space and I'd value an honest fit check from someone inside the team today.";
const JOB_URL = "https://careers.wipro.com/job/product-designer-123";
const CASE_STUDY = { id: 11, title: "Led the approvals redesign", kind: "case_study", source: null, url: "https://example.com/approvals", pinned: true, visibleOnProfile: true };
const CODE = { id: 12, title: "Shipped the mobile PWA", kind: "code", source: "GitHub", url: "https://github.com/example/pwa", pinned: false, visibleOnProfile: true };

// Each ask gets its own submission key, so a retired one is visible in the calls.
function stubCrypto() {
  let issued = 0;
  const subtle = {
    digest: vi.fn(async () => new Uint8Array(32).buffer),
    importKey: vi.fn(async () => ({})),
    encrypt: vi.fn(async () => new Uint8Array(16).buffer),
  };
  vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => `00000000-0000-4000-8000-${String(++issued).padStart(12, "0")}`, subtle });
}

function stubComposer(fetchMock: ReturnType<typeof vi.fn>, items: readonly unknown[], sendJson: unknown, firstSendRefusal?: { status: number; body: unknown }) {
  let sends = 0;
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/api/documents/uploads")) return ok({ sessionId: "sess-1", chunkBytes: 1024 * 1024 });
    if (String(url).includes("/chunks")) return ok({});
    if (String(url).includes("/complete")) return ok({ id: 77, fileName: "resume.pdf" });
    if (String(url).endsWith("/api/work-items")) return ok({ items });
    if (String(url).endsWith("/api/company-referrals")) {
      sends += 1;
      if (firstSendRefusal && sends === 1) return { ok: false, status: firstSendRefusal.status, json: async () => firstSendRefusal.body };
      return ok(sendJson);
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
}

const chip = (title: string) => screen.getByRole("button", { name: new RegExp(title, "i") });
const sendCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/company-referrals"));
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => JSON.parse(String((sendCalls(fetchMock)[call] as unknown as Array<{ body?: string }>)?.[1]?.body)) as Record<string, unknown>;
const sendKey = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => ((sendCalls(fetchMock)[call] as unknown as Array<{ headers?: Record<string, string> }>)[1]?.headers ?? {})["Idempotency-Key"];

/** Fills the composer and sends, once the showcase picker has settled on `settle`. */
async function composeAndSend(fetchMock: ReturnType<typeof vi.fn>, settle: () => Promise<unknown>) {
  render(<Ask />);
  await settle();
  fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: JOB_URL } });
  fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: NOTE } });
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
  await waitFor(() => expect(sendCalls(fetchMock).length).toBeGreaterThan(0));
}

const pinnedVisible = () => screen.findByRole("button", { name: /Led the approvals redesign/i });
const emptyShowcaseVisible = () => screen.findByRole("link", { name: "Add a piece of work" });

describe("Ask pinned work", () => {
  it("preselects the pieces the seeker already pins, in showcase order", async () => {
    const fetchMock = vi.fn();
    stubComposer(fetchMock, [CASE_STUDY, CODE], {});
    render(<Ask />);
    expect(await screen.findByText("Pinned work")).toBeTruthy();
    expect((await pinnedVisible()).getAttribute("aria-pressed")).toBe("true");
    expect(chip("Shipped the mobile PWA").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("1 of 2 travel with this ask")).toBeTruthy();
    expect(screen.getByText("Relevant work attached")).toBeTruthy();
    expect(screen.getByText("The referrer sees your role, note, and pinned work — not your name or resume — until they accept.")).toBeTruthy();
  });

  it("sends the pinned pieces with the ask", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubComposer(fetchMock, [CASE_STUDY, CODE], { requestId: 5, companyDomain: "wipro.com" });
    await composeAndSend(fetchMock, pinnedVisible);
    expect(sentBody(fetchMock).workItemIds).toEqual([11]);
    expect(await screen.findByText("Ask sent to wipro.com.")).toBeTruthy();
  });

  it("sends no pinned-work field when the seeker has nothing pinned", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubComposer(fetchMock, [{ ...CODE, pinned: false }], { requestId: 6, companyDomain: "wipro.com" });
    await composeAndSend(fetchMock, () => screen.findByText("Nothing picked — the referrer sees only your note"));
    expect(sentBody(fetchMock)).not.toHaveProperty("workItemIds");
  });

  it("keeps the seeker's tap order and takes a piece back off before sending", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubComposer(fetchMock, [CASE_STUDY, CODE], { requestId: 7, companyDomain: "wipro.com" });
    render(<Ask />);
    await pinnedVisible();
    fireEvent.click(chip("Shipped the mobile PWA"));
    expect(screen.getByText("2 of 2 travel with this ask")).toBeTruthy();
    fireEvent.click(chip("Led the approvals redesign"));
    expect(chip("Led the approvals redesign").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("1 of 2 travel with this ask")).toBeTruthy();
    fireEvent.click(chip("Led the approvals redesign"));
    // Tapped back on last, so the referrer reads it last (shared/askWorkItems.ts).
    expect(screen.getByText("2 of 2 travel with this ask")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: JOB_URL } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: NOTE } });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    await waitFor(() => expect(sendCalls(fetchMock).length).toBeGreaterThan(0));
    expect(sentBody(fetchMock).workItemIds).toEqual([12, 11]);
  });

  it("trims to the plan's cap after the server's refusal and sends again inside it", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    const refusal = { status: 409, body: { error: "Your Free plan puts 1 piece of work in front of a referrer. Choose the one that best proves this role.", code: "plan_limit", limit: "showcase_pins", cap: 1 } };
    stubComposer(fetchMock, [CASE_STUDY, CODE], { requestId: 9, companyDomain: "wipro.com" }, refusal);
    render(<Ask />);
    await pinnedVisible();
    // Two pieces on a plan that carries one.
    fireEvent.click(chip("Shipped the mobile PWA"));
    expect(screen.getByText("2 of 2 travel with this ask")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: JOB_URL } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: NOTE } });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your Free plan puts 1 piece of work in front of a referrer");
    expect(screen.getByText("Kept the first piece. Tap another to swap it in.")).toBeTruthy();
    expect(chip("Shipped the mobile PWA").getAttribute("aria-pressed")).toBe("false");
    // Over the cap nothing was created, so the refusal retires the submission key.
    const firstKey = sendKey(fetchMock);
    expect(sessionStorage.getItem("skipwait-ask-idempotency-key")).toBeNull();

    // Past the cap the picker says why instead of doing nothing.
    fireEvent.click(chip("Shipped the mobile PWA"));
    expect(chip("Shipped the mobile PWA").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/puts 1 piece of work in front of a referrer — unpin one to swap/)).toBeTruthy();

    // Swap: unpin the default, pin the other, and the retry carries only that one.
    fireEvent.click(chip("Led the approvals redesign"));
    fireEvent.click(chip("Shipped the mobile PWA"));
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    await waitFor(() => expect(sendCalls(fetchMock).length).toBe(2));
    expect(sentBody(fetchMock, 1).workItemIds).toEqual([12]);
    expect(sendKey(fetchMock, 1)).not.toBe(firstKey);
    expect(await screen.findByText("Ask sent to wipro.com.")).toBeTruthy();
  });

  it("points an empty showcase at the Work page", async () => {
    const fetchMock = vi.fn();
    stubComposer(fetchMock, [], {});
    render(<Ask />);
    const link = await emptyShowcaseVisible();
    expect(link.getAttribute("href")).toBe("/work");
    expect(screen.getByText("Relevant work attached")).toBeTruthy();
    expect(screen.getByText("Needs work")).toBeTruthy();
  });

  it("offers a retry instead of an empty list when the showcase read fails", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/work-items")) { attempts += 1; return { ok: false, status: 500, json: async () => ({ error: "We could not load your work" }) }; }
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Ask />);
    expect(await screen.findByText("We couldn't load your work.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(attempts).toBe(2));
    expect(screen.queryByRole("link", { name: "Add a piece of work" })).toBeNull();
  });

  it("holds the loading state until the showcase answers", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    render(<Ask />);
    expect(screen.getByText("Loading your work showcase…")).toBeTruthy();
    expect(screen.getByText("Relevant work attached")).toBeTruthy();
  });
});
