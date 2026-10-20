// @vitest-environment jsdom
import React from "react";import{cleanup,fireEvent,render,screen,waitFor}from"@testing-library/react";import{afterEach,beforeEach,describe,expect,it,vi}from"vitest";import EmailReviewAction from"./EmailReviewAction";
const{authState,go}=vi.hoisted(()=>({authState:{signedIn:true},go:vi.fn()}));vi.mock("@/_core/auth",()=>({useAuth:()=>({isSignedIn:authState.signedIn,getToken:vi.fn().mockResolvedValue("test-token")})}));vi.mock("wouter",()=>({useRoute:()=>[true,{linkToken:"a".repeat(48)}],useLocation:()=>["/email-review",go]}));vi.mock("@/components/WorkEmailSignIn",()=>({WorkEmailSignIn:()=> <div>Work email sign in</div>}));
describe("EmailReviewAction",()=>{beforeEach(()=>{authState.signedIn=true});afterEach(()=>{cleanup();vi.unstubAllGlobals();go.mockClear()});it("opens via GET without committing, then records only after an explicit button",async()=>{const fetchMock=vi.fn(async(input:string,init?:RequestInit)=>String(input).endsWith("/decision")?{ok:true,json:async()=>({status:"approved"})}:{ok:true,json:async()=>({review:{ready:true}})});vi.stubGlobal("fetch",fetchMock);render(<EmailReviewAction/>);await waitFor(()=>expect(screen.getByText("Choose your decision.")).toBeTruthy());expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({method:"POST"});expect((screen.getByRole("button",{name:/accept & connect/i}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:/accept & connect/i}));await waitFor(()=>expect(screen.getByText("Request accepted.")).toBeTruthy());expect(fetchMock).toHaveBeenCalledTimes(2);expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({method:"POST",body:JSON.stringify({decision:"approved",ethicsConfirmed:true})})});
it("reports a decline as a private pass, never as a terminal decision", async () => {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (String(input).endsWith("/decision")) return { ok: true, json: async () => ({ status: "passed" }) };
    return { ok: true, json: async () => ({ review: { ready: true } }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<EmailReviewAction />);
  await waitFor(() => expect(screen.getByText("Choose your decision.")).toBeTruthy());
  // D-035/D-052: nothing is preselected, so the pass cannot be sent without a reason.
  const pass = screen.getByRole("button", { name: /pass privately/i }) as HTMLButtonElement;
  expect(pass.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "At capacity right now" }));
  expect(pass.disabled).toBe(false);
  fireEvent.click(pass);
  await waitFor(() => expect(screen.getByText("Passed privately.")).toBeTruthy());
  expect(screen.getByText(/stays open to other verified employees/i)).toBeTruthy();
  expect(screen.queryByText("Request declined.")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  // The shared code travels with the legacy reason it maps to.
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing", passReason: "at_capacity" }) });
});

it("offers the same seven reasons as the dashboard, with no credit wording", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => String(input).endsWith("/decision") ? { ok: true, json: async () => ({ status: "passed" }) } : { ok: true, json: async () => ({ review: { ready: true } }) }));
  render(<EmailReviewAction />);
  await waitFor(() => expect(screen.getByText("Choose your decision.")).toBeTruthy());
  for (const label of ["Not my team or function", "Role needs more experience", "Not enough context", "At capacity right now", "Role is closed", "I only refer people I know", "Prefer not to say"]) {
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
  }
  // D-066 (4): the referrer never sees what a pass costs the seeker.
  expect((document.body.textContent ?? "").toLowerCase()).not.toMatch(/credit|refund/);
});
});
