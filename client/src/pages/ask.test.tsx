// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ask from "./Ask";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
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
    expect(screen.getByText("Write a great ask.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to ask" })).toBeTruthy();
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
  });
});
