// @vitest-environment jsdom
// D-086.ui packet §5.2: the line and the list render the server's public
// payload only. Switch off, loading, error, offline and "none" render nothing;
// every figure is a GoalNum; the help links use referrerSignInHref().
import { readFileSync } from "node:fs";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMAND_LIST_HEADING,
  DEMAND_UNLISTED_EMPLOYEE_LINE,
  DEMAND_UNLISTED_SEEKER_LINE,
  demandBonusLine,
  demandCountLine,
  demandFewLine,
  demandHelpLine,
} from "@shared/companyDemand";
import { referrerSignInHref } from "@/lib/referrerSignIn";

const flag = vi.hoisted(() => ({ publicOn: false, events: [] as string[] }));
vi.mock("@shared/companyDemand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/companyDemand")>();
  return { ...actual, get COMPANY_DEMAND_PUBLIC_ENABLED() { return flag.publicOn; } };
});
vi.mock("@/lib/clarity", () => ({ trackClarityEvent: (event: string) => flag.events.push(event) }));

import { CompanyDemandLine } from "./CompanyDemandLine";
import { CompanyDemandList } from "./CompanyDemandList";

const COMPANY = "Acme";
const FORBIDDEN = [/credit/i, /\bask\b/i, /\bwaiting\b/i, /\bopen\b/i, /not open yet/i, /suggest/i];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.publicOn = false; flag.events = []; });

function renderInRouter(ui: ReactElement) {
  const location = memoryLocation({ path: "/explore", record: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Router hook={location.hook} searchHook={location.searchHook}>{ui}</Router></QueryClientProvider>);
}

const respond = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));
const detail = (demand: unknown) => ({ demand });
const countEntry = (slug: string, name: string, people: number) => ({ slug, name, demand: { state: "count", people } });
const fewEntry = (slug: string, name: string) => ({ slug, name, demand: { state: "few" } });

const lineProps = { slug: "acme", companyName: COMPANY };

describe("CompanyDemandLine", () => {
  it("switch off (shipped state): no request at all and nothing rendered", async () => {
    respond(200, detail({ state: "count", people: 12 }));
    const { container } = renderInRouter(<CompanyDemandLine {...lineProps} />);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("loading renders nothing", async () => {
    flag.publicOn = true;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { container } = renderInRouter(<CompanyDemandLine {...lineProps} />);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("a server error renders nothing and never the raw error", async () => {
    flag.publicOn = true;
    respond(500, { error: "SQL exploded at row 7" });
    const { container } = renderInRouter(<CompanyDemandLine {...lineProps} />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(/SQL/)).toBeNull();
  });

  it("offline (a rejected fetch) renders nothing", async () => {
    flag.publicOn = true;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { container } = renderInRouter(<CompanyDemandLine {...lineProps} />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("none renders nothing", async () => {
    flag.publicOn = true;
    respond(200, detail({ state: "none" }));
    const { container } = renderInRouter(<CompanyDemandLine {...lineProps} />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("an unparsable payload (a count below 3) renders nothing", async () => {
    flag.publicOn = true;
    respond(200, detail({ state: "count", people: 2 }));
    const { container } = renderInRouter(<CompanyDemandLine {...lineProps} />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("count renders the exact sentence and the number as a GoalNum", async () => {
    flag.publicOn = true;
    respond(200, detail({ state: "count", people: 12 }));
    renderInRouter(<CompanyDemandLine {...lineProps} />);
    const line = await screen.findByTestId("company-demand-line");
    expect(screen.getByTestId("demand-sentence").textContent).toBe(demandCountLine(COMPANY, 12));
    expect(within(line).getByTestId("goal-num").textContent).toBe("12");
  });

  it("few renders the exact sentence with no digit", async () => {
    flag.publicOn = true;
    respond(200, detail({ state: "few" }));
    renderInRouter(<CompanyDemandLine {...lineProps} />);
    await screen.findByTestId("company-demand-line");
    const sentence = screen.getByTestId("demand-sentence").textContent ?? "";
    expect(sentence).toBe(demandFewLine(COMPANY));
    expect(sentence).not.toMatch(/[0-9]/);
  });

  it("the one help link is the work-email sign-in and reports one Clarity event", async () => {
    flag.publicOn = true;
    respond(200, detail({ state: "count", people: 12 }));
    renderInRouter(<CompanyDemandLine {...lineProps} />);
    const line = await screen.findByTestId("company-demand-line");
    const links = within(line).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(referrerSignInHref());
    expect(screen.getByTestId("demand-help-line").textContent).toBe(demandHelpLine(COMPANY));
    await userEvent.click(links[0]);
    expect(flag.events).toEqual(["demand_help_clicked"]);
  });

  it("the bonus line names the employer's own programme truthfully", async () => {
    flag.publicOn = true;
    respond(200, detail({ state: "count", people: 12 }));
    renderInRouter(<CompanyDemandLine {...lineProps} />);
    const bonus = await screen.findByTestId("demand-bonus-line");
    expect(bonus.textContent).toBe(demandBonusLine(COMPANY));
    expect(bonus.textContent).toContain("skipwait.me never pays referrers");
    expect(bonus.textContent).not.toMatch(/[0-9]/);
    expect(bonus.textContent).not.toMatch(/[$€£₹]/);
    expect(bonus.textContent).not.toMatch(/guarantee/i);
  });

  it("carries no black commit and none of the retired wording", async () => {
    flag.publicOn = true;
    respond(200, detail({ state: "count", people: 12 }));
    const { container } = renderInRouter(<CompanyDemandLine {...lineProps} />);
    await screen.findByTestId("company-demand-line");
    expect(container.querySelector("[data-g-primary]")).toBeNull();
    for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern);
  });
});

describe("CompanyDemandList", () => {
  it("switch off (shipped state): no request at all and nothing rendered", async () => {
    respond(200, { companies: [countEntry("acme", "Acme", 5)] });
    const { container } = renderInRouter(<CompanyDemandList />);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("an empty directory list renders nothing", async () => {
    flag.publicOn = true;
    respond(200, { companies: [] });
    const { container } = renderInRouter(<CompanyDemandList />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("an error or a malformed payload renders nothing", async () => {
    flag.publicOn = true;
    respond(200, { companies: [countEntry("acme", "Acme", 2)] });
    const { container } = renderInRouter(<CompanyDemandList />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("keeps the server's order, links each company and heads the directory list", async () => {
    flag.publicOn = true;
    respond(200, { companies: [fewEntry("beta", "Beta"), countEntry("acme", "Acme", 5)] });
    renderInRouter(<CompanyDemandList />);
    const list = await screen.findByTestId("company-demand-list");
    expect(within(list).getByRole("heading", { level: 2 }).textContent).toBe(DEMAND_LIST_HEADING);
    const links = within(list).getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe("/explore/beta");
    expect(links[1].getAttribute("href")).toBe("/explore/acme");
    expect(links[0].textContent).toBe(demandFewLine("Beta"));
    expect(links[1].textContent).toBe(demandCountLine("Acme", 5));
    expect(within(links[1]).getByTestId("goal-num").textContent).toBe("5");
  });

  it("adds the two unlisted-company lines with their honest links", async () => {
    flag.publicOn = true;
    respond(200, { companies: [countEntry("acme", "Acme", 5)] });
    const { container } = renderInRouter(<CompanyDemandList />);
    await screen.findByTestId("company-demand-list");
    expect(container.textContent).toContain(DEMAND_UNLISTED_SEEKER_LINE);
    expect(container.textContent).toContain(DEMAND_UNLISTED_EMPLOYEE_LINE);
    const seeker = screen.getByRole("link", { name: /Request a referral with a job link/ });
    expect(seeker.getAttribute("href")).toBe("/ask");
    const employee = screen.getByRole("link", { name: /Verify your work email to help people asking there/ });
    expect(employee.getAttribute("href")).toBe(referrerSignInHref());
    await userEvent.click(employee);
    expect(flag.events).toEqual(["demand_help_clicked"]);
  });

  it("renders no total, no number below 3 and none of the retired wording", async () => {
    flag.publicOn = true;
    respond(200, { companies: [fewEntry("beta", "Beta"), countEntry("acme", "Acme", 3)] });
    const { container } = renderInRouter(<CompanyDemandList />);
    const list = await screen.findByTestId("company-demand-list");
    expect(list.textContent).not.toMatch(/total/i);
    expect(list.textContent).not.toMatch(/\b(0|1|2) (people|person)\b/);
    expect(container.querySelector("[data-g-primary]")).toBeNull();
    for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern);
  });
});

describe("source pins", () => {
  it("never imports SignInButton, openSignIn, the kit or the ui components", () => {
    for (const file of ["CompanyDemandLine.tsx", "CompanyDemandList.tsx"]) {
      const source = readFileSync(`client/src/components/demand/${file}`, "utf8");
      expect(source, file).not.toMatch(/SignInButton|openSignIn/);
      expect(source, file).not.toMatch(/components\/kit|components\/ui/);
    }
  });
});
