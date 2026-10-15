// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASK_PREFILL_KEY, saveAskPrefill } from "@/lib/askPrefill";
import { REFERRER_LINK_INACTIVE_ERROR, REFERRER_LINK_OTHER_COMPANY_ERROR } from "@shared/referrerLink";
import Ask from "./Ask";

// D-017: an ask begun from a referrer's personal link goes to that referrer.
const { authState } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", vi.fn()],
}));

const CODE = "abcdefghijklmnop1234";
const JOB = "https://careers.tcs.com/job/product-designer-42";
const NOTE = "I've led two end-to-end redesigns of enterprise approval workflows, cutting task time by 40% for 3000 users over 4 years. This Product Designer role focuses on the same problem space and I'd value an honest fit check from someone inside the team today.";
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });
type SendResult = ReturnType<typeof ok> | ReturnType<typeof fail>;

function stubFetch(...sendResults: SendResult[]) {
  vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer), importKey: vi.fn(async () => ({})), encrypt: vi.fn(async () => new Uint8Array(16).buffer) } });
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url);
    if (path.endsWith("/api/documents/uploads")) return ok({ sessionId: "sess-1", chunkBytes: 1024 * 1024 });
    if (path.includes("/chunks")) return ok({});
    if (path.includes("/complete")) return ok({ id: 77, fileName: "resume.pdf" });
    if (path.endsWith("/api/company-referrals")) return sendResults.shift() ?? fail(500, "unexpected extra send");
    if (path.endsWith("/mine")) return ok({ requests: [{ status: "pending" }] });
    return fail(404, "not found");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sendBodies = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls
  .filter(([url]) => String(url).endsWith("/api/company-referrals"))
  .map(call => JSON.parse(String((call as unknown as Array<{ body?: string }>)[1]?.body)) as Record<string, unknown>);

function attachAndSend() {
  fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: NOTE } });
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
}

beforeEach(() => { authState.isLoaded = true; authState.isSignedIn = true; sessionStorage.clear(); localStorage.clear(); window.history.replaceState(null, "", "/ask"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("Ask through a referrer's personal link", () => {
  it("prefills the job link handed over by /start and sends the vanity alias with the ask", async () => {
    const fetchMock = stubFetch(ok({ requestId: 41, companyDomain: "tcs.com", fastTrack: true }));
    saveAskPrefill({ targetRoleUrl: JOB, referrerLink: { fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" } });
    window.history.replaceState(null, "", "/ask?referCompany=tcs&referAlias=asha-k");
    render(<Ask />);
    expect((screen.getByLabelText(/Official job link/) as HTMLInputElement).value).toBe(JOB);
    expect(screen.getByText("Goes only to the verified employee whose private link you used.")).toBeTruthy();
    attachAndSend();
    expect(await screen.findByText("Ask sent to tcs.com.")).toBeTruthy();
    expect(screen.getByText("Only the verified employee whose private link you used will see it.")).toBeTruthy();
    expect(screen.queryByText(/expires in/)).toBeNull();
    expect(sendBodies(fetchMock)).toEqual([expect.objectContaining({ targetRoleUrl: JOB, fastTrackCompanySlug: "tcs", fastTrackAlias: "asha-k" })]);
    expect(sendBodies(fetchMock)[0]).not.toHaveProperty("fastTrackCode");
    // Sent: the hand-off is gone and a reload of this URL cannot reuse the link.
    expect(sessionStorage.getItem(ASK_PREFILL_KEY)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("sends nothing about a referrer when the seeker did not come through a personal link", async () => {
    const fetchMock = stubFetch(ok({ requestId: 42, companyDomain: "tcs.com" }));
    saveAskPrefill({ targetRoleUrl: JOB });
    render(<Ask />);
    expect(screen.queryByText(/whose private link you used/)).toBeNull();
    attachAndSend();
    await screen.findByText("Ask sent to tcs.com.");
    expect(Object.keys(sendBodies(fetchMock)[0]).filter(key => key.startsWith("fastTrack"))).toEqual([]);
  });

  it("shows a paused link's error and sends to the company only when the seeker chooses", async () => {
    const fetchMock = stubFetch(fail(400, REFERRER_LINK_INACTIVE_ERROR), ok({ requestId: 43, companyDomain: "tcs.com" }));
    saveAskPrefill({ targetRoleUrl: JOB, referrerLink: { fastTrackCode: CODE } });
    window.history.replaceState(null, "", `/ask?fast=${CODE}`);
    render(<Ask />);
    attachAndSend();
    expect((await screen.findByRole("alert")).textContent).toContain(REFERRER_LINK_INACTIVE_ERROR);
    expect(screen.queryByText(/Ask sent to/)).toBeNull();
    // No silent fallback: one send so far, and it carried the link.
    expect(sendBodies(fetchMock)).toEqual([expect.objectContaining({ fastTrackCode: CODE })]);
    fireEvent.click(screen.getByRole("button", { name: "Send to the company instead" }));
    expect(await screen.findByText("Ask sent to tcs.com.")).toBeTruthy();
    expect(screen.getByText(/Verified tcs.com referrers will see it/)).toBeTruthy();
    const [, second] = sendBodies(fetchMock);
    expect(second).toMatchObject({ targetRoleUrl: JOB, attachmentIds: [77] });
    expect(second).not.toHaveProperty("fastTrackCode");
    // The retry reuses the idempotency key: the refused attempt created nothing.
    const keys = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/company-referrals")).map(call => ((call as unknown as Array<{ headers?: Record<string, string> }>)[1]?.headers ?? {})["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
    expect(window.location.search).toBe("");
  });

  it("keeps the link and offers no company fallback for errors that are not about the link", async () => {
    const fetchMock = stubFetch(fail(400, "You have used this month’s included credits. Add a credit pack or choose Pro or Max to send another referral."));
    window.history.replaceState(null, "", `/ask?fast=${CODE}`);
    render(<Ask />);
    fireEvent.change(screen.getByLabelText(/Official job link/), { target: { value: JOB } });
    attachAndSend();
    expect((await screen.findByRole("alert")).textContent).toContain("included credits");
    expect(screen.queryByRole("button", { name: /instead/ })).toBeNull();
    expect(screen.getByText("Goes only to the verified employee whose private link you used.")).toBeTruthy();
    expect(sendBodies(fetchMock)).toEqual([expect.objectContaining({ fastTrackCode: CODE })]);
  });

  it("a job at another company: shows the error and sends to that company only when the seeker chooses", async () => {
    const WIPRO_JOB = "https://careers.wipro.com/job/9";
    const fetchMock = stubFetch(fail(400, REFERRER_LINK_OTHER_COMPANY_ERROR), ok({ requestId: 46, companyDomain: "wipro.com" }));
    // A link kept from earlier in this tab; the seeker now asks about a Wipro job.
    saveAskPrefill({ targetRoleUrl: JOB, referrerLink: { fastTrackCode: CODE } });
    render(<Ask />);
    fireEvent.change(screen.getByLabelText(/Official job link/), { target: { value: WIPRO_JOB } });
    attachAndSend();
    expect((await screen.findByRole("alert")).textContent).toContain(REFERRER_LINK_OTHER_COMPANY_ERROR);
    expect(sendBodies(fetchMock)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Send to the company instead" }));
    expect(await screen.findByText("Ask sent to wipro.com.")).toBeTruthy();
    const [first, second] = sendBodies(fetchMock);
    expect(first).toMatchObject({ targetRoleUrl: WIPRO_JOB, fastTrackCode: CODE });
    expect(second).toMatchObject({ targetRoleUrl: WIPRO_JOB });
    expect(second).not.toHaveProperty("fastTrackCode");
    expect(sessionStorage.getItem(ASK_PREFILL_KEY)).toBeNull();
  });

  it("starts the next ask without the referrer once one is sent", async () => {
    const fetchMock = stubFetch(ok({ requestId: 44, companyDomain: "tcs.com", fastTrack: true }), ok({ requestId: 45, companyDomain: "tcs.com" }));
    window.history.replaceState(null, "", `/ask?fast=${CODE}`);
    render(<Ask />);
    fireEvent.change(screen.getByLabelText(/Official job link/), { target: { value: JOB } });
    attachAndSend();
    await screen.findByText("Ask sent to tcs.com.");
    fireEvent.click(screen.getByRole("button", { name: "Write another" }));
    expect(screen.queryByText(/whose private link you used/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Official job link/), { target: { value: JOB } });
    attachAndSend();
    await waitFor(() => expect(sendBodies(fetchMock)).toHaveLength(2));
    expect(sendBodies(fetchMock)[1]).not.toHaveProperty("fastTrackCode");
  });
});
