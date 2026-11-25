import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => [] as Array<{ error: unknown; context?: Record<string, unknown> }>);
vi.mock("./sentry", () => ({
  captureClientError: (error: unknown, context?: Record<string, unknown>) => { captured.push({ error, context }); },
}));

import { apiFetch, apiRouteTemplate, reportQueryCacheError, resetApiFetchReportsForTests } from "./apiFetch";

const fetchMock = vi.fn();

function reportText(): string {
  return JSON.stringify(captured.map(entry => ({
    message: entry.error instanceof Error ? entry.error.message : String(entry.error),
    context: entry.context,
  })));
}

describe("apiFetch (REL-client-capture)", () => {
  beforeEach(() => {
    captured.length = 0;
    resetApiFetchReportsForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reports a 503 once per route per page load", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "down" }), { status: 503, headers: { "content-type": "application/json" } }));
    await apiFetch("/api/auth/otp/send", { method: "POST" });
    await apiFetch("/api/auth/otp/send", { method: "POST" });
    expect(captured).toHaveLength(1);
    expect(captured[0].context).toMatchObject({ source: "api-fetch", kind: "api_5xx", status: 503, route: "/api/auth/otp/send", method: "POST" });
  });

  it("reports an HTML body where JSON was expected once", async () => {
    fetchMock.mockImplementation(async () => new Response("<!DOCTYPE html><html></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    await apiFetch("/api/work-email/otp/verify", { method: "POST" });
    await apiFetch("/api/work-email/otp/verify", { method: "POST" });
    expect(captured).toHaveLength(1);
    expect(captured[0].context).toMatchObject({ kind: "api_html_response", status: 200, route: "/api/work-email/otp/verify" });
  });

  it("reports a network failure once and rethrows the same error", async () => {
    const failure = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValue(failure);
    await expect(apiFetch("/api/chargebee/subscription-recovery", { method: "POST" })).rejects.toBe(failure);
    await expect(apiFetch("/api/chargebee/subscription-recovery", { method: "POST" })).rejects.toBe(failure);
    expect(captured).toHaveLength(1);
    expect(captured[0].context).toMatchObject({ kind: "api_network_error" });
  });

  it("does not report a user abort", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    fetchMock.mockRejectedValue(abort);
    await expect(apiFetch("/api/auth/otp/send")).rejects.toBe(abort);
    expect(captured).toHaveLength(0);
  });

  it("returns exactly the response fetch returned and passes the arguments through unchanged", async () => {
    const response = new Response(JSON.stringify({ sent: true }), { status: 200, headers: { "content-type": "application/json" } });
    fetchMock.mockResolvedValue(response);
    const init: RequestInit = { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.co" }) };
    const result = await apiFetch("/api/auth/otp/send", init);
    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/auth/otp/send", init]);
    expect(fetchMock.mock.calls[0][1]).toBe(init);
    await expect(result.json()).resolves.toEqual({ sent: true });
    expect(captured).toHaveLength(0);
  });

  it("keeps the call arity when no init is given", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await apiFetch("/api/health");
    expect(fetchMock.mock.calls[0]).toEqual(["/api/health"]);
  });

  it("leaves the body of a reported response unread for the caller", async () => {
    const response = new Response("<html>gateway</html>", { status: 502, headers: { "content-type": "text/html" } });
    fetchMock.mockResolvedValue(response);
    const result = await apiFetch("/api/auth/otp/send");
    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    await expect(result.text()).resolves.toBe("<html>gateway</html>");
    expect(captured).toHaveLength(1);
  });

  it("returns a test double without headers untouched and never throws from inspection", async () => {
    const double = { ok: false, json: async () => ({ error: "x" }) };
    fetchMock.mockResolvedValue(double);
    await expect(apiFetch("/api/auth/otp/send")).resolves.toBe(double);
    expect(captured).toHaveLength(0);
  });

  it("does not report a 400, 401, 404 or 429", async () => {
    for (const status of [400, 401, 404, 429]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "no" }), { status, headers: { "content-type": "application/json" } }));
      await apiFetch(`/api/route-${status}`);
    }
    expect(captured).toHaveLength(0);
  });

  it("tags reports with a route template that carries no token, id or query", async () => {
    const token = "Zx81_qL0-aB3cD4eF5gH6";
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    await apiFetch(`/api/referrer-review-links/${token}?email=someone%40example.com&code=123456`);
    await apiFetch(new URL("https://skipwait.me/api/requests/48213/withdraw?x=1"));
    expect(captured).toHaveLength(2);
    // The packet's rule is literal: any 16+ character [A-Za-z0-9_-] segment becomes :id,
    // route words included, so this tag is lossy by design and can never keep a token.
    expect(captured[0].context?.route).toBe("/api/:id/:id");
    expect(captured[1].context?.route).toBe("/api/requests/:id/withdraw");
    const text = reportText();
    for (const secret of [token, "48213", "someone", "example.com", "123456", "?"]) expect(text).not.toContain(secret);
  });

  it("templates paths with the packet's rule", () => {
    expect(apiRouteTemplate("/api/auth/otp/send")).toBe("/api/auth/otp/send");
    expect(apiRouteTemplate("/api/thing/12/sub/abcdefghijklmnop")).toBe("/api/thing/:id/sub/:id");
    expect(apiRouteTemplate("/api/thing/abcdefghijklmno")).toBe("/api/thing/abcdefghijklmno");
    expect(apiRouteTemplate("https://skipwait.me/api/x/99?y=2#z")).toBe("/api/x/:id");
  });
});

describe("reportQueryCacheError (REL-client-capture, main.tsx handlers)", () => {
  beforeEach(() => { captured.length = 0; resetApiFetchReportsForTests(); });

  it("reports the HTML-instead-of-JSON parse error as api_html_response instead of dropping it", () => {
    reportQueryCacheError(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"), "query");
    expect(captured).toHaveLength(1);
    expect((captured[0].error as Error).message).toBe("api_html_response");
    expect(captured[0].context).toMatchObject({ source: "react-query", kind: "api_html_response" });
    expect(reportText()).not.toContain("DOCTYPE");
  });

  it("reports a 5xx or untyped error from a query or mutation", () => {
    const serverError = Object.assign(new Error("Internal server error"), { data: { httpStatus: 500 } });
    reportQueryCacheError(serverError, "mutation");
    reportQueryCacheError(new Error("boom"), "query");
    expect(captured.map(entry => entry.error)).toEqual([serverError, expect.any(Error)]);
    expect(captured[0].context).toMatchObject({ source: "react-mutation" });
  });

  it("does not report a 4xx", () => {
    reportQueryCacheError(Object.assign(new Error("Please login (10001)"), { data: { httpStatus: 401 } }), "query");
    reportQueryCacheError(Object.assign(new Error("Not found"), { data: { httpStatus: 404 } }), "mutation");
    reportQueryCacheError(Object.assign(new Error("Bad request"), { status: 400 }), "query");
    expect(captured).toHaveLength(0);
  });

  it("reports the same failure at most once per page load", () => {
    const error = Object.assign(new Error("Internal server error"), { data: { httpStatus: 500 } });
    reportQueryCacheError(error, "query");
    reportQueryCacheError(error, "query");
    reportQueryCacheError(new SyntaxError("Unexpected token '<'"), "query");
    reportQueryCacheError(new SyntaxError("Unexpected token '<'"), "mutation");
    expect(captured).toHaveLength(2);
  });
});
