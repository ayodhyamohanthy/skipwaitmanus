// @vitest-environment jsdom
// AYO-20 honesty fix: the credit_spend approval card never invents a cost and
// never shows wallet-after math the server does not perform.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard, type ApprovalHandlers } from "./ApprovalSheet";
import type { AssistantApproval } from "./format";

vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const approval = (creditCount: number | null): AssistantApproval => ({
  id: 1, kind: "credit_spend", status: "pending", provider: "chatgpt",
  companyDomain: "quillmint.com", role: "Designer", note: null,
  creditCount, slotCount: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
});

const handlers = (): ApprovalHandlers => ({
  editing: false, draftNote: "", working: false, actionError: "",
  onDraftChange: vi.fn(), onStartEdit: vi.fn(), onSaveEdit: vi.fn(), onDecide: vi.fn(),
});

afterEach(cleanup);

describe("the credit_spend approval card", () => {
  it("fails closed on an unstated cost instead of showing a made-up 1", () => {
    render(<ApprovalCard approval={approval(null)} balance={3} primary handlers={handlers()} />);
    expect(screen.getByText("Cost not stated")).toBeTruthy();
    expect(screen.queryByText("1 credit")).toBeNull();
    expect(screen.queryByText(/after this/)).toBeNull();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Not now" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the stated cost and balance with record-only semantics, no charge promise", () => {
    render(<ApprovalCard approval={approval(2)} balance={3} primary handlers={handlers()} />);
    expect(screen.getByText("The assistant states: 2 credits")).toBeTruthy();
    expect(screen.getByText(/You have 3 credits/)).toBeTruthy();
    expect(screen.getByText(/Approving records your decision only/)).toBeTruthy();
    expect(screen.getByText(/No credits move/)).toBeTruthy();
    expect(screen.queryByText(/after this/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Use / })).toBeNull();
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("treats a zero or negative stated cost as unknown", () => {
    render(<ApprovalCard approval={approval(0)} balance={3} primary handlers={handlers()} />);
    expect(screen.getByText("Cost not stated")).toBeTruthy();
  });
});
