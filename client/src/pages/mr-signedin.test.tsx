// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.stubGlobal("fetch", vi.fn(async (input: any) => {
  const url = String(input);
  if (url.includes("auth.me")) return new Response(JSON.stringify([{ result: { data: { json: { id: 7, openId: "workemail_x", name: "R", email: "r@ethoslife.com", loginMethod: "otp_work_email", role: "user", createdAt: "", updatedAt: "" } } } }]), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.includes("/api/company-referrals/mine")) return new Response(JSON.stringify({ requests: [{ id: 6, targetRoleUrl: "https://x.com/j", companyDomain: "ethoslife.com", status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attachmentCount: 1, waitingForCoverage: false }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({}), { status: 200 });
}));

class StackCatcher extends React.Component {
  render() { return this.props.children as React.ReactElement; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.log("COMPONENT STACK:\n" + info.componentStack); }
}

describe("MyRequests signed-in", () => {
  it("renders request list", async () => {
    const { default: MyRequests } = await import("./MyRequests");
    const { ServerSessionCompatProvider } = await import("../_core/auth");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ServerSessionCompatProvider>
          <StackCatcher><MyRequests /></StackCatcher>
        </ServerSessionCompatProvider>
      </QueryClientProvider>
    );
    await new Promise(r => setTimeout(r, 400));
    console.log("BODY:", document.body.textContent?.slice(0, 200));
    expect(document.body.textContent?.length ?? 0).toBeGreaterThan(50);
  });
});
