// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoalAssistants from "./GoalAssistants";
import GoalSeekerAgents from "./GoalSeekerAgents";
import GoalApprove from "./GoalApprove";
import GoalConnectAssistant from "./GoalConnectAssistant";
const {auth} = vi.hoisted(() => ({auth:{isSignedIn:true,isLoaded:true,getToken:vi.fn().mockResolvedValue("fixture-token"),signOut:vi.fn(),openSignIn:vi.fn()}}));
vi.mock("@/_core/auth",()=>({useAuth:()=>auth,useUser:()=>({user:{primaryEmailAddress:{emailAddress:"fictional@example.invalid"}}})}));
vi.mock("wouter",()=>({useSearch:()=>"",Link:({href,children}:{href:string;children:React.ReactNode})=><a href={href}>{children}</a>}));
const response = (body:object,status=200) => ({ok:status<400,status,json:async()=>body});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
beforeEach(()=>{auth.isSignedIn=true;auth.isLoaded=true;});
describe("goal assistant flows",()=>{
 it("does not fetch or offer a grant before identity loads",async()=>{
   auth.isLoaded=false;auth.isSignedIn=false;const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
   render(<GoalSeekerAgents/>); expect(screen.getByText("Checking sign-in...")).toBeTruthy();expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"Create agent key"})).toBeNull();
 });
 it("puts the gated state ahead of the agent form without an enabled create",async()=>{
   vi.stubGlobal("fetch",vi.fn(async()=>response({error:"Not found"},404)));
   const {container}=render(<GoalSeekerAgents/>);expect(await screen.findByText("Agent access is not turned on yet.")).toBeTruthy();
   expect(screen.queryByRole("button",{name:"Create agent key"})).toBeNull();expect(container.querySelector('[data-g-primary]')).toBeNull();
 });
 it("creates only granted draft/lookup scopes and shows key once",async()=>{
   const fetch=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==="POST"?response({key:"fixture-key-not-real"}):response({agents:[],paused:false}));vi.stubGlobal("fetch",fetch);
   render(<GoalSeekerAgents/>);await screen.findByLabelText("Agent name");fireEvent.change(screen.getByLabelText("Agent name"),{target:{value:"Fictional draft helper"}});fireEvent.click(screen.getByRole("button",{name:"Create agent key"}));
   expect(await screen.findByTestId("agent-key")).toBeTruthy();const call=fetch.mock.calls.find(([,init])=>init?.method==="POST");expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({name:"Fictional draft helper",scopes:["lookup","draft"],expiresInDays:7});
   fireEvent.click(screen.getByRole("button",{name:"I saved it"}));expect(screen.queryByTestId("agent-key")).toBeNull();
 });
 it("preserves a failed token name for retry and never claims creation",async()=>{
   const fetch=vi.fn(async(url:string,init?:RequestInit)=>init?.method==="POST"?response({error:"Try later"},503):response(url.includes("access")?{hasAccess:true}:url.includes("connections")?{connections:[]}:url.includes("tokens")?{tokens:[]}:{activity:[]}));vi.stubGlobal("fetch",fetch);
   render(<GoalAssistants/>);await screen.findByRole("tab",{name:"API tokens"});fireEvent.click(screen.getByRole("tab",{name:"API tokens"}));fireEvent.change(screen.getByLabelText("Name this API token"),{target:{value:"Fictional tracker"}});fireEvent.click(screen.getByRole("button",{name:"Create token"}));expect(await screen.findByText("Try later")).toBeTruthy();expect((screen.getByLabelText("Name this API token") as HTMLInputElement).value).toBe("Fictional tracker");expect(screen.queryByText("Copy your token now")).toBeNull();
 });
 it("does not present purchasable Land or tokens when the server denies access",async()=>{
   vi.stubGlobal("fetch",vi.fn(async()=>response({hasAccess:false})));
   render(<GoalAssistants/>);expect(await screen.findByText("Assistants are not available on your plan")).toBeTruthy();expect(screen.queryByRole("button",{name:"Create token"})).toBeNull();expect(document.querySelector('a[href="/plans"]')).toBeNull();
 });
 it("presents one approval at a time and records no success on rejected decision",async()=>{
   const approval={id:7,kind:"ask_send",status:"pending",provider:"custom",companyDomain:"fictional.invalid",role:"Fictional role",note:"Confirmed skill",creditCount:2,slotCount:2,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
   const fetch=vi.fn(async(url:string,init?:RequestInit)=>init?.method==="POST"?response({error:"Approval changed"},409):response(url.includes("summary")?{summary:{totalAvailable:8}}:{approvals:[approval,{...approval,id:8,role:"Second role"}]}));vi.stubGlobal("fetch",fetch);
   const {container}=render(<GoalApprove/>);await screen.findByRole("button",{name:"Send referral"});expect(container.querySelectorAll('[data-g-primary]')).toHaveLength(1);fireEvent.click(screen.getByRole("button",{name:"Send referral"}));expect(await screen.findByText("Approval changed")).toBeTruthy();expect(screen.queryByText("Decision recorded")).toBeNull();
 });
 it("honors the server plan gate on connection and offers no approve action",async()=>{
   vi.stubGlobal("fetch",vi.fn(async()=>response({hasAccess:false})));
   render(<GoalConnectAssistant/>);expect(await screen.findByText("Assistant access is not available")).toBeTruthy();expect(screen.queryByRole("button",{name:"Approve"})).toBeNull();
 });
 it("triggers openSignIn on sign-in button click when signed out",async()=>{
   auth.isSignedIn=false;auth.isLoaded=true;auth.openSignIn.mockClear();
   render(<GoalAssistants/>);
   const btn = await screen.findByRole("button",{name:"Sign in"});
   fireEvent.click(btn);
   expect(auth.openSignIn).toHaveBeenCalled();
 });
 it("keeps the token list visible when a revoke fails and renders activity events",async()=>{
   const token = { id: 42, name: "Notion tracker", prefix: "sw_AbCdEfGhIj", createdAt: new Date().toISOString(), lastUsedAt: null };
   const event = { action: "assistant.connected", outcome: "success", resourceType: "assistant_connection", metadata: { provider: "chatgpt" }, createdAt: new Date().toISOString() };
   const fetch = vi.fn(async (url: string, init?: RequestInit) => {
     if (init?.method === "DELETE") return response({ error: "Server revoke error" }, 500);
     if (url.includes("access")) return response({ hasAccess: true });
     if (url.includes("connections")) return response({ connections: [] });
     if (url.includes("tokens")) return response({ tokens: [token] });
     if (url.includes("activity")) return response({ activity: [event] });
     return response({});
   });
   vi.stubGlobal("fetch", fetch);
   render(<GoalAssistants />);
   fireEvent.click(await screen.findByRole("tab", { name: "API tokens" }));
   expect(await screen.findByText(/Notion tracker/)).toBeTruthy();
   fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
   expect(await screen.findByText("Server revoke error")).toBeTruthy();
   expect(screen.getByText(/Notion tracker/)).toBeTruthy();
   fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
   expect(await screen.findByText("Connected ChatGPT")).toBeTruthy();
 });
  it("uses referral-only wording for an agent draft cost",async()=>{
    const agent={id:7,name:"Fictional helper",keyPrefix:"sw_fictional",scopes:["lookup","draft"],limits:{creditsPerAsk:1,creditsPerDay:2,creditsPerWeek:3,asksPerDay:1},status:"active",expiresAt:new Date(Date.now()+86400000).toISOString(),lastUsedAt:null,createdAt:new Date().toISOString()};
    const draft={id:3,companySlug:"fictional",targetRoleUrl:"https://jobs.fictional.invalid/role",note:"Fictional draft",jobLevel:1,creditCost:1,status:"draft",createdAt:new Date().toISOString()};
    const fetch=vi.fn(async(url:string)=>url.includes("/drafts")?response({drafts:[draft]}):url.includes("/events")?response({events:[]}):response({agents:[agent],paused:false}));
    vi.stubGlobal("fetch",fetch);
    const {container}=render(<GoalSeekerAgents/>);
    fireEvent.click(await screen.findByRole("button",{name:"Activity"}));
    await waitFor(()=>expect(container.textContent).toContain("1 referral"));
    expect(container.textContent).not.toContain("credits");
  });

 it("re-reads approvals when decision submission fails so an already-decided approval leaves pending",async()=>{
   const approval = { id: 11, kind: "ask_send", status: "pending", provider: "custom", companyDomain: "fictional.invalid", role: "Fictional role", note: "Confirmed skill", creditCount: 1, slotCount: 1, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
   let postAttempted = false;
   const fetch = vi.fn(async (url: string, init?: RequestInit) => {
     if (init?.method === "POST") {
       postAttempted = true;
       throw new TypeError("Failed to fetch (network lost)");
     }
     if (url.includes("summary")) return response({ summary: { totalAvailable: 8 } });
     return response({ approvals: postAttempted ? [{ ...approval, status: "approved" }] : [approval] });
   });
   vi.stubGlobal("fetch", fetch);
   render(<GoalApprove />);
   const sendBtn = await screen.findByRole("button", { name: "Send referral" });
   fireEvent.click(sendBtn);
   await waitFor(() => {
     expect(screen.queryByRole("button", { name: "Send referral" })).toBeNull();
   });
 });
});
