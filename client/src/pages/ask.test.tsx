// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ask from "./Ask";

const { authState, go } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", go],
}));

beforeEach(() => { authState.isLoaded = true; authState.isSignedIn = true; go.mockReset(); sessionStorage.clear(); });
const fetchCalls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });
const WEAK_NOTE = "Please refer me for any role.";
const STRONG_NOTE = "I've led two end-to-end redesigns of enterprise approval workflows, cutting task time by 40% for 3000 users over 4 years. This Product Designer role focuses on the same problem space and I'd value an honest fit check from someone inside the team today.";

function stubCrypto() {
  const subtle = {
    digest: vi.fn(async () => new Uint8Array(32).buffer),
    importKey: vi.fn(async () => ({})),
    encrypt: vi.fn(async () => new Uint8Array(16).buffer),
  };
  vi.stubGlobal("crypto", { getRandomValues: (arr: Uint8Array) => arr, randomUUID: () => "12345678-1234-4123-8123-123456789012", subtle });
}

function stubUploadThen(fetchMock: ReturnType<typeof vi.fn>, sendJson: unknown) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).endsWith("/api/documents/uploads")) return ok({ sessionId: "sess-1", chunkBytes: 1024 * 1024 });
    if (String(url).includes("/chunks")) return ok({});
    if (String(url).includes("/complete")) return ok({ id: 77, fileName: "resume.pdf" });
    if (String(url).endsWith("/api/smart-pitch")) return ok({ draft: STRONG_NOTE });
    if (String(url).endsWith("/api/company-referrals")) return ok(sendJson);
    if (String(url).endsWith("/mine")) return ok({ requests: [] });
    return ok({});
  });
}

describe("Ask composer", () => {
  it("keeps composing behind sign-in", () => {
    authState.isSignedIn = false;
    render(<Ask />);
    expect(screen.getByRole("heading", { name: "Write a great ask." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to ask" })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/careers.company/)).toBeNull();
  });

  it("waits for the auth check instead of flashing the sign-in gate", () => {
    authState.isLoaded = false;
    authState.isSignedIn = false;
    render(<Ask />);
    expect(screen.getByRole("status").textContent).toContain("Checking your sign-in");
    expect(screen.queryByRole("button", { name: "Sign in to ask" })).toBeNull();
    expect(screen.queryByPlaceholderText(/careers.company/)).toBeNull();
  });

  it("renders the kit composer with only checks the live send path honours", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<Ask />);
    expect(screen.getByRole("heading", { name: "Write a great ask." })).toBeTruthy();
    expect(screen.getByText("ASK STRENGTH")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map(item => item.querySelector("strong")?.textContent)).toEqual(["Official job link", "30–120 words", "One specific proof of fit", "Resume attached"]);
    expect(screen.getByText("Add resume (shared after accept)")).toBeTruthy();
    expect(screen.getByText("The referrer sees your role and note — not your name or resume — until they accept.")).toBeTruthy();
    expect(screen.getByText("Uses 1 credit · referrals are always free")).toBeTruthy();
    const page = document.body.textContent ?? "";
    for (const preview of ["DESIGN PREVIEW", "Fill example", "Role location", "Location works for you", "pinned", "Enterprise approvals redesign", "open slots", "Improve my note", "Wipro"]) expect(page).not.toContain(preview);
    expect(fetchCalls()).toBe(0);
  });

  it("shows the picked resume as an attached chip and lets the seeker remove it", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<Ask />);
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "asha-resume.pdf", { type: "application/pdf" })] } });
    expect(screen.getByText("asha-resume.pdf")).toBeTruthy();
    expect(screen.getByText("(shared after accept)")).toBeTruthy();
    expect(screen.queryByText("Add your resume — it's required to send.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove asha-resume.pdf" }));
    expect(screen.getByText("Add resume (shared after accept)")).toBeTruthy();
    expect(screen.getByText("Add your resume — it's required to send.")).toBeTruthy();
  });

  it("rejects an unsupported resume type before any upload", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Ask />);
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["x"], "resume.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Use a PDF, Word document, PNG, or JPEG resume.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scores a weak ask honestly and keeps send disabled", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<Ask />);
    expect(screen.getByText("Needs work")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: "wipro jobs" } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: WEAK_NOTE } });
    expect(screen.getByText(/doesn't look like a job posting link/)).toBeTruthy();
    expect(screen.getByText(/Avoid “any role”/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send ask/ }).hasAttribute("disabled")).toBe(true);
  });

  it("drafts from an uploaded resume through the free starting-draft endpoint", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, {});
    vi.stubGlobal("fetch", fetchMock);
    render(<Ask />);
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: "https://careers.wipro.com/job/product-designer-123" } });
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Draft from my resume/ }));
    await waitFor(() => expect((screen.getByPlaceholderText(/Name the role/) as HTMLTextAreaElement).value).toContain("40%"));
    expect(fetchMock).toHaveBeenCalledWith("/api/smart-pitch", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("Strong")).toBeTruthy();
  });

  it("sends with an idempotency key and links the created thread", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, { requestId: 9, companyDomain: "wipro.com" });
    vi.stubGlobal("fetch", fetchMock);
    render(<Ask />);
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: "https://careers.wipro.com/job/product-designer-123" } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: STRONG_NOTE } });
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    await waitFor(() => expect(screen.getByText("Ask sent to wipro.com.")).toBeTruthy());
    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/company-referrals"));
    expect(sendCall).toBeTruthy();
    const headers = (sendCall as unknown as Array<{ headers?: Record<string, string> }>)?.[1]?.headers ?? {};
    expect(headers["Idempotency-Key"]).toMatch(/^[\x21-\x7E]{16,64}$/);
    expect(JSON.parse(String((sendCall as unknown as Array<{ body?: string }>)?.[1]?.body))).toMatchObject({ targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", attachmentIds: [77] });
    expect(screen.getByRole("link", { name: /Track this ask/ }).getAttribute("href")).toBe("/conversation/9");
    expect(screen.getByText("Verified wipro.com referrers will see it. It expires in 7 days if nobody accepts, and your credit returns.")).toBeTruthy();
    expect(screen.getByText("Open asks:").textContent).toBe("Open asks: 0");
    fireEvent.click(screen.getByRole("button", { name: "Write another" }));
    expect((screen.getByPlaceholderText(/careers.company/) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Add resume (shared after accept)")).toBeTruthy();
  });

  it("tells the seeker honestly when the company has no verified referrers yet", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, { requestId: 12, companyDomain: "merkle.com", coverageStatus: "waiting_for_company_coverage" });
    vi.stubGlobal("fetch", fetchMock);
    render(<Ask />);
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: "https://careers.merkle.com/job/analyst-42" } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: STRONG_NOTE } });
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    expect(await screen.findByText("Ask sent to merkle.com.")).toBeTruthy();
    expect(screen.getByText(/No verified referrers there yet/)).toBeTruthy();
    expect(screen.queryByText(/expires in 7 days/)).toBeNull();
  });

  it("picks up the job link and note handed over from a company door, and clears it once sent", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, { requestId: 21, companyDomain: "wipro.com" });
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.setItem("skipwait-ask-prefill", JSON.stringify({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", note: STRONG_NOTE, savedAt: Date.now() }));
    render(<Ask />);
    expect((screen.getByPlaceholderText(/careers.company/) as HTMLInputElement).value).toBe("https://careers.wipro.com/job/product-designer-123");
    expect((screen.getByPlaceholderText(/Name the role/) as HTMLTextAreaElement).value).toBe(STRONG_NOTE);
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    await screen.findByText("Ask sent to wipro.com.");
    expect(sessionStorage.getItem("skipwait-ask-prefill")).toBeNull();
  });

  it("ignores a malformed hand-over instead of prefilling it", () => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.setItem("skipwait-ask-prefill", JSON.stringify({ targetRoleUrl: "https://careers.wipro.com/job/1", note: "x", injected: true }));
    render(<Ask />);
    expect((screen.getByPlaceholderText(/careers.company/) as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText(/Name the role/) as HTMLTextAreaElement).value).toBe("");
  });

  it("forwards a fast-track code and a confirmed company domain for the same link", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, { requestId: 14, companyDomain: "tcs.com" });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/ask?fast=abcdefghijklmnop1234");
    localStorage.setItem("bridge-company-confirmation", JSON.stringify({ canonicalUrl: "https://careers.example.com/job/42", confirmedDomain: "tcs.com" }));
    render(<Ask />);
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: "https://careers.example.com/job/42" } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: STRONG_NOTE } });
    fireEvent.change(screen.getByPlaceholderText(/LPA/), { target: { value: "₹18–22 LPA" } });
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    await screen.findByText("Ask sent to tcs.com.");
    const sendCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/company-referrals"));
    expect(JSON.parse(String((sendCall as unknown as Array<{ body?: string }>)?.[1]?.body))).toMatchObject({ fastTrackCode: "abcdefghijklmnop1234", confirmedCompanyDomain: "tcs.com", compensation: "₹18–22 LPA" });
    window.history.replaceState(null, "", "/ask");
    localStorage.removeItem("bridge-company-confirmation");
  });

  it("surfaces server credit enforcement without inventing slot math", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, {});
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/api/company-referrals")) return { ok: false, status: 400, json: async () => ({ error: "You have used this month's included credits." }) };
      if (String(url).endsWith("/api/documents/uploads")) return ok({ sessionId: "sess-1", chunkBytes: 1024 * 1024 });
      if (String(url).includes("/chunks")) return ok({});
      if (String(url).includes("/complete")) return ok({ id: 77, fileName: "resume.pdf" });
      return ok({ requests: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Ask />);
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: "https://careers.wipro.com/job/product-designer-123" } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: STRONG_NOTE } });
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    expect(await screen.findByText(/used this month's included credits/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("used this month's included credits");
    expect(screen.queryByText(/Ask sent to/)).toBeNull();
    expect(sessionStorage.getItem("skipwait-ask-idempotency-key")).toBeTruthy();
  });

  async function composeAndSend(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    render(<Ask />);
    fireEvent.change(screen.getByPlaceholderText(/careers.company/), { target: { value: "https://careers.wipro.com/job/product-designer-123" } });
    fireEvent.change(screen.getByPlaceholderText(/Name the role/), { target: { value: STRONG_NOTE } });
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(picker, { target: { files: [new File(["resume-bytes"], "resume.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
  }

  it("keeps the same idempotency key and shows plain copy when the network drops mid-send", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, {});
    const uploadAndPitch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/company-referrals")) throw new TypeError("Failed to fetch");
      return uploadAndPitch?.(url, init);
    });
    await composeAndSend(fetchMock);
    expect((await screen.findByRole("alert")).textContent).toContain("We couldn't reach SkipWait. Check your connection and try again.");
    expect(document.body.textContent).not.toContain("Failed to fetch");
    const firstKey = sessionStorage.getItem("skipwait-ask-idempotency-key");
    expect(firstKey).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Send ask/ }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/company-referrals"))).toHaveLength(2));
    const sends = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/company-referrals"));
    const keys = sends.map(call => ((call as unknown as Array<{ headers?: Record<string, string> }>)[1]?.headers ?? {})["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api/documents/uploads"))).toHaveLength(1);
  });

  it("does not confirm an ask the server response cannot prove was created", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, { requestId: "9", companyDomain: "wipro.com" });
    await composeAndSend(fetchMock);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not send this ask");
    expect(screen.queryByText(/Ask sent to/)).toBeNull();
    expect(sessionStorage.getItem("skipwait-ask-idempotency-key")).toBeTruthy();
  });

  it("omits the open-ask count when the list cannot be read", async () => {
    stubCrypto();
    const fetchMock = vi.fn();
    stubUploadThen(fetchMock, { requestId: 31, companyDomain: "wipro.com" });
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/mine")) return { ok: false, status: 500, json: async () => ({ error: "We could not load your referral requests" }) };
      return base?.(url, init);
    });
    await composeAndSend(fetchMock);
    await screen.findByText("Ask sent to wipro.com.");
    expect(screen.queryByText("Open asks:")).toBeNull();
  });
});
