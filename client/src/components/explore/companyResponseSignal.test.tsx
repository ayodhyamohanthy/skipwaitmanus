// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/flags", () => ({ get COMPANY_RESPONSE_SIGNAL() { return flag.on; } }));
import { CompanyResponseSignal } from "./CompanyResponseSignal";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = true; });
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CompanyResponseSignal slug="wipro" /></QueryClientProvider>);
const respond = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));

describe("CompanyResponseSignal", () => {
  it("client flag off (shipped state): no request at all and nothing rendered", async () => {
    flag.on = false;
    respond(200, { signal: { state: "shown", usualFirstReplyDays: 2, answeredThisMonth: 12, referrersInside: 3 } });
    const { container } = mount();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });
  it("flag off (server 404): renders nothing", async () => {
    respond(404, { error: "Not found" });
    const { container } = mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
  it("network or server error: renders nothing, never raw error text", async () => {
    respond(500, { error: "SQL exploded at row 7" });
    const { container } = mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(/SQL/)).toBeNull();
  });
  it("shown: three figures and the honest disclaimer", async () => {
    respond(200, { signal: { state: "shown", usualFirstReplyDays: 2, answeredThisMonth: 12, referrersInside: 3 } });
    mount();
    expect(await screen.findByText("2 days")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("referrers inside")).toBeTruthy();
    expect(screen.getByText(/never a ranking, never for sale/)).toBeTruthy();
  });
  it("singular day at 1", async () => {
    respond(200, { signal: { state: "shown", usualFirstReplyDays: 1, answeredThisMonth: 3, referrersInside: 3 } });
    mount();
    expect(await screen.findByText("1 day")).toBeTruthy();
  });
  it("insufficient: hides every figure and says Not enough data yet", async () => {
    respond(200, { signal: { state: "insufficient" } });
    mount();
    expect(await screen.findByText("Not enough data yet")).toBeTruthy();
    expect(screen.queryByText("usual first reply")).toBeNull();
    expect(screen.queryByText("referrers inside")).toBeNull();
  });
  it("a malformed payload renders nothing", async () => {
    respond(200, { signal: { state: "shown", usualFirstReplyDays: "x" } });
    const { container } = mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
