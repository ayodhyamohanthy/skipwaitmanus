// @vitest-environment jsdom
// D-132 item 3: the approval card states the deferred-charge truth grounded in
// server/db.ts createCompanyReferralRequest - credits and a slot are used only
// when the ask reaches a referrer; a waiting ask holds no slot and nothing is
// charged while it waits. The card cannot know coverage at render time and
// never promises it; it explains the price and its timing instead.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard, type ApprovalHandlers } from "./ApprovalSheet";
import type { AssistantApproval } from "./format";

vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const baseApproval: AssistantApproval = {
  id: 1,
  kind: "ask_send",
  status: "pending",
  provider: "chatgpt",
  companyDomain: "example.net",
  role: "Platform Engineer",
  note: "I led three platform migrations.",
  creditCount: 6,
  slotCount: null,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

const handlers: ApprovalHandlers = {
  editing: false,
  draftNote: "",
  working: false,
  actionError: "",
  onDraftChange: () => {},
  onStartEdit: () => {},
  onSaveEdit: () => {},
  onDecide: () => {},
};

afterEach(() => cleanup());

describe("ApprovalCard ask_send cost truth", () => {
  it("states the deferred charge: credits and a slot are used only when the ask reaches a referrer", () => {
    render(<ApprovalCard approval={baseApproval} balance={12} primary handlers={handlers} />);
    expect(screen.getByText("Send this ask to example.net?")).toBeTruthy();
    expect(screen.getByText(/6 credits and 1 open slot are used only when the ask reaches a referrer/)).toBeTruthy();
    expect(screen.getByText(/nothing is charged and no slot is held/)).toBeTruthy();
    expect(screen.queryByText(/uses 1 of your open slots/)).toBeNull();
  });

  it("without a classified cost it promises no number and no slot claim", () => {
    render(<ApprovalCard approval={{ ...baseApproval, creditCount: null }} balance={12} primary handlers={handlers} />);
    expect(screen.queryByText(/open slot/)).toBeNull();
  });
});
