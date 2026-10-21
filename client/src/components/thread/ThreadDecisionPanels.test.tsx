// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadRequest } from "@/lib/threadApi";
import { ReferrerPanel, SeekerPanel } from "./ThreadDecisionPanels";

/*
 * D-038-reconcile R-2: while REFERRED_DEADLINE_ENABLED is false the client
 * offers no part B control — no deadline line, no extend, no step-back, no
 * "I got the referral email" — even if a stale response still carries the
 * deadline fields. The base "Mark as referred" action stays.
 */

vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const base: ThreadRequest = {
  id: 501, title: "Product Designer", pitch: null, candidateName: null, targetRoleUrl: null,
  companyDomain: "acme.com", companyName: null, companyInitials: null, jobFunction: null,
  status: "approved", referrerId: 2, referrerMessage: null, createdAt: null,
  attachments: [], attachmentCount: 0,
  referredDueAt: "2026-11-01T12:00:00.000Z", extensionUsed: false,
};

afterEach(cleanup);

describe("part B controls while the switch is off (D-038-reconcile R-2)", () => {
  it("the referrer sees Mark as referred but no deadline, extension or step-back", () => {
    render(<ReferrerPanel request={base} role="referrer-claimed" passed={false} returnPath="/queue" onAccept={async () => {}} onPass={async () => {}} onMarkReferred={async () => {}} onExtendReferredDeadline={async () => {}} onStepBack={async () => {}} />);

    expect(screen.getByRole("button", { name: /Mark as referred/ })).toBeTruthy();
    expect(screen.queryByText(/Mark as referred by/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Need 3 more days" })).toBeNull();
    expect(screen.queryByRole("button", { name: /can't refer this/ })).toBeNull();
  });

  it("the seeker cannot confirm receipt", () => {
    render(<SeekerPanel request={base} onWithdraw={async () => {}} onProgress={async () => {}} onConfirmReferredEmail={async () => {}} />);

    expect(screen.queryByRole("button", { name: /I got the referral email/ })).toBeNull();
    expect(screen.getByText(/Use messages to coordinate/)).toBeTruthy();
  });
});
