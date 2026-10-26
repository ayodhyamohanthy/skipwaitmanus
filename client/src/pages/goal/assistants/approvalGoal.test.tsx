// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalApprovalCard } from "./GoalApprovalCard";
import type { AssistantApproval } from "@/components/assistants/format";
const base: AssistantApproval = { id: 9, kind: "credit_spend", status: "pending", provider: "custom", companyDomain: "fixture.invalid", role: "Draft review", note: "Only confirmed skills.", creditCount: 3, slotCount: 2, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() };
const handlers = () => ({ editing: false, draftNote: "", working: false, actionError: "", onDraftChange: vi.fn(), onStartEdit: vi.fn(), onSaveEdit: vi.fn(), onDecide: vi.fn() });
afterEach(cleanup);
describe("goal approval boundary", () => {
  it("shows the exact cost and balance before the only commit", () => {
    const h = handlers(); const {container} = render(<GoalApprovalCard approval={base} balance={8} primary handlers={h} />);
    expect(screen.getByText("3 referrals")).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "8 available · 5 after this")).toBeTruthy();
    expect(container.querySelectorAll('[data-g-primary]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Use 3 referrals" })); expect(h.onDecide).toHaveBeenCalledWith("approved");
  });
  it("cannot approve an expired, declined, or offline request", () => {
    const h = handlers(); const {rerender} = render(<GoalApprovalCard approval={{...base, expiresAt: "2000-01-01T00:00:00Z"}} balance={8} primary handlers={h} />);
    fireEvent.click(screen.getByRole("button", {name: "Use 3 referrals"})); expect(h.onDecide).not.toHaveBeenCalled();
    rerender(<GoalApprovalCard approval={{...base, status: "declined"}} balance={8} primary handlers={h} />);
    fireEvent.click(screen.getByRole("button", {name: "Use 3 referrals"})); expect(h.onDecide).not.toHaveBeenCalled();
  });
  it("blocks network approval while offline", () => {
    Object.defineProperty(navigator,"onLine",{configurable:true,value:false});
    const h=handlers(); render(<GoalApprovalCard approval={base} balance={8} primary handlers={h}/>);
    fireEvent.click(screen.getByRole("button",{name:"Use 3 referrals"}));expect(h.onDecide).not.toHaveBeenCalled();
    Object.defineProperty(navigator,"onLine",{configurable:true,value:true});
  });
  it("never invents a missing cost and fails closed: the spend cannot be approved", () => {
    const h = handlers(); render(<GoalApprovalCard approval={{...base, creditCount: null}} balance={8} primary handlers={h} />);
    expect(screen.queryByText("1 credit")).toBeNull();
    expect(screen.queryByText("1 referral")).toBeNull();
    expect(screen.queryByText(/after this/)).toBeNull();
    expect(screen.getAllByText(/Cost unavailable/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Approve spend" }));
    expect(h.onDecide).not.toHaveBeenCalled();
  });
  it("keeps a known-cost spend approvable with its exact figure", () => {
    const h = handlers(); render(<GoalApprovalCard approval={base} balance={8} primary handlers={h} />);
    fireEvent.click(screen.getByRole("button", { name: "Use 3 referrals" }));
    expect(h.onDecide).toHaveBeenCalledWith("approved");
  });
  it("does not send unsaved edits and never offers send when slots are full", () => {
    const h = handlers(); const {rerender,container} = render(<GoalApprovalCard approval={{...base,kind:"ask_send"}} balance={8} primary handlers={{...h,editing:true,draftNote:"New note"}} />);
    expect(screen.queryByRole("button",{name:"Send ask"})).toBeNull();
    fireEvent.click(screen.getByRole("button", {name:"Save note"})); expect(h.onSaveEdit).toHaveBeenCalledOnce();
    rerender(<GoalApprovalCard approval={{...base,kind:"ask_send",slotCount:0}} balance={8} primary handlers={h} />);
    expect(screen.queryByRole("button",{name:"Send ask"})).toBeNull();
    expect(container.querySelectorAll('[data-g-primary]')).toHaveLength(0);
  });
});
