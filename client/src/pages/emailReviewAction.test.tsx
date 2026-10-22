// @vitest-environment jsdom
import React from "react";import{cleanup,fireEvent,render,screen,waitFor}from"@testing-library/react";import{afterEach,beforeEach,describe,expect,it,vi}from"vitest";import EmailReviewAction from"./EmailReviewAction";
const{authState,go}=vi.hoisted(()=>({authState:{signedIn:true},go:vi.fn()}));vi.mock("@/_core/auth",()=>({useAuth:()=>({isSignedIn:authState.signedIn,getToken:vi.fn().mockResolvedValue("test-token")})}));vi.mock("wouter",()=>({useRoute:()=>[true,{linkToken:"a".repeat(48)}],useLocation:()=>["/email-review",go]}));vi.mock("@/components/WorkEmailSignIn",()=>({WorkEmailSignIn:()=> <div>Work email sign in</div>}));
describe("EmailReviewAction",()=>{beforeEach(()=>{authState.signedIn=true});afterEach(()=>{cleanup();vi.unstubAllGlobals();go.mockClear()});it("opens via GET without committing, then records only after an explicit button",async()=>{const fetchMock=vi.fn(async(input:string,init?:RequestInit)=>String(input).endsWith("/decision")?{ok:true,json:async()=>({status:"approved"})}:{ok:true,json:async()=>({review:{ready:true}})});vi.stubGlobal("fetch",fetchMock);render(<EmailReviewAction/>);await waitFor(()=>expect(screen.getByText("Choose your decision.")).toBeTruthy());expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({method:"POST"});expect((screen.getByRole("button",{name:/accept & connect/i}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:/accept & connect/i}));await waitFor(()=>expect(screen.getByText("Request accepted.")).toBeTruthy());expect(fetchMock).toHaveBeenCalledTimes(2);expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({method:"POST",body:JSON.stringify({decision:"approved",ethicsConfirmed:true})})});
it("reports a decline as a private pass, never as a terminal decision (D-035: the pass reason rides along)", async () => {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (String(input).endsWith("/decision")) return { ok: true, json: async () => ({ status: "passed" }) };
    return { ok: true, json: async () => ({ review: { ready: true } }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<EmailReviewAction />);
  await waitFor(() => expect(screen.getByText("Choose your decision.")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /at capacity right now/i }));
  await waitFor(() => expect(screen.getByText("Passed privately.")).toBeTruthy());
  expect(screen.getByText(/stays open to other verified employees/i)).toBeTruthy();
  expect(screen.queryByText("Request declined.")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "timing", passReason: "at_capacity" }) });
});

it("offers the seven shared pass reasons with nothing preselected and no credit wording (D-035)", async () => {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (String(input).endsWith("/decision")) return { ok: true, json: async () => ({ status: "passed" }) };
    return { ok: true, json: async () => ({ review: { ready: true } }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<EmailReviewAction />);
  await waitFor(() => expect(screen.getByText("Choose your decision.")).toBeTruthy());
  for (const [label, code] of [["Not my team or function", "not_my_team"], ["Role needs more experience", "needs_experience"], ["Not enough context", "not_enough_context"], ["At capacity right now", "at_capacity"], ["Role is closed", "role_closed"], ["I only refer people I know", "only_refer_known"], ["Prefer not to say", "prefer_not_to_say"]] as const) {
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
  }
  // Nothing preselected: no pressed or checked control carries a reason before a click.
  const pressed = screen.queryAllByRole("button", { pressed: true });
  expect(pressed).toEqual([]);
  // No credit wording: the page never says what the credit does on a pass.
  expect(screen.queryByText(/credit/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Prefer not to say" }));
  await waitFor(() => expect(screen.getByText("Passed privately.")).toBeTruthy());
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ decision: "declined", declineReason: "cannot_support", passReason: "prefer_not_to_say" }) });
});
});
