import { useEffect, useState } from "react";
import { GoalButton, GoalNum, GoalStatus } from "@/components/goal";
import { providerLabel, type AssistantApproval } from "@/components/assistants/format";
import { NetworkButton, NextStep, Section } from "./AssistantLayout";

type Handlers = { editing: boolean; draftNote: string; working: boolean; actionError: string; onDraftChange(value: string): void; onStartEdit(): void; onSaveEdit(): void; onDecide(decision: "approved" | "declined"): void };
// D-180: the seeker balance is "referrals" in user-facing copy (owner, Oct 23).
const referralsLabel = (count: number): string => `${count} ${count === 1 ? "referral" : "referrals"}`;

export function GoalApprovalCard({ approval, balance, primary, handlers: h }: { approval: AssistantApproval; balance: number | null; primary: boolean; handlers: Handlers }) {
  // Expiry is a UI guard, never an alternative to server validation.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const expiry = Date.parse(approval.expiresAt);
  const ended = !Number.isFinite(expiry) || expiry <= now || approval.status !== "pending";
  const full = approval.kind === "ask_send" && approval.slotCount === 0;
  // An unknown cost is never rendered as an invented number: the held PR 550
  // card's \`?? 1\` showed "1 credit" the server never quoted, and the server
  // does not block or re-resolve a missing cost at decision time today, so this
// card fails closed: an unknown-cost spend cannot be approved at all.
  const cost = approval.creditCount;
  const exactCost = typeof cost === "number" && Number.isFinite(cost) && cost >= 0;
  const title = approval.kind === "credit_spend" ? "Review this paid tool" : `Review your ask to ${approval.companyDomain ?? "this company"}`;
  const costUnknown = approval.kind === "credit_spend" && !exactCost;
  const blocked = ended ? "This approval has ended. Refresh your approvals." : h.working ? "A decision is being recorded" : costUnknown ? "Cost unavailable. You can't approve this spend." : undefined;
  // Charge timing is server truth, not a copy claim: the spend lands when the ask first
  // reaches an available referrer (server/db.ts:1958-1960, D-034); a waiting ask pays
  // nothing and holds no slot (server/db.ts:1917, D-061).
  return <article aria-label={title}>
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"><span className="text-g-meta text-g-ink-2">Prepared by {providerLabel(approval.provider)}</span><GoalStatus status={ended ? "expired" : "waiting"} label={ended ? "Approval ended" : "Waiting for your decision"} /></div>
    <h2 className="text-g-heading">{title}</h2>
    {approval.role ? <p className="mt-2 text-g-body text-g-ink-2">{approval.role}</p> : null}
    <Section title="Before you decide">
      {exactCost ? <p className="text-g-label">{referralsLabel(cost)}</p> : null}
      {approval.kind === "credit_spend" && exactCost && balance !== null ? <p className="mt-2 text-g-meta text-g-ink-2"><GoalNum>{balance}</GoalNum> available · <GoalNum>{Math.max(0, balance - cost)}</GoalNum> after this</p> : balance === null ? <p className="mt-2 text-g-meta text-g-ink-2">Balance unavailable. The server checks your balance before acting.</p> : null}
      {approval.kind === "ask_send" ? <p className="mt-2 text-g-meta text-g-ink-2">{full ? "All your slots are in use. Keep this as a draft or manage your asks." : "The same balance checks, open-request limits and routing apply as when you send an ask yourself."}</p> : null}
      {costUnknown ? <p className="mt-2 text-g-meta text-g-ink-2">Cost unavailable. You can't approve this spend.</p> : null}
    </Section>
    {approval.kind === "ask_send" && exactCost && cost > 0 ? <p className="mb-5 text-g-meta text-g-ink-2">{referralsLabel(cost)} and 1 open slot are used only when the ask reaches a referrer. While it waits for one, nothing is charged and no slot is held.</p> : null}
    {approval.kind === "ask_send" ? <Section title="Your note">{h.editing ? <label className="grid gap-2 text-g-label">Ask note<textarea className="min-h-40 w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body" value={h.draftNote} onChange={event => h.onDraftChange(event.target.value)} /></label> : <p className="whitespace-pre-wrap break-words text-g-body">{approval.note || "No note yet. Edit before sending."}</p>}</Section> : null}
    {h.actionError ? <p role="alert" className="mb-4 text-g-meta">{h.actionError}</p> : null}
    <NextStep>
      <p className="mb-3 text-g-body text-g-ink-2">{h.editing ? "Save your changes before you decide to send." : full ? "No ask can be sent while every slot is in use." : "Review the action and cost. Nothing happens until you approve."}</p>
      <div className="flex flex-wrap items-center gap-2">
        {full ? <GoalButton asChild variant="outline"><a href="/requests">Manage requests</a></GoalButton> : h.editing ? <NetworkButton variant={primary ? "primary" : "outline"} blocked={ended || h.working ? "This note cannot be saved now" : !h.draftNote.trim() ? "Add a note first" : undefined} onClick={h.onSaveEdit}>Save note</NetworkButton> : <NetworkButton variant={primary ? "primary" : "outline"} blocked={blocked} busy={h.working} onClick={() => h.onDecide("approved")}>{approval.kind === "credit_spend" ? (exactCost ? `Use ${referralsLabel(cost)}` : "Approve spend") : "Send ask"}</NetworkButton>}
        <NetworkButton blocked={ended || h.working ? "This approval cannot be changed now" : undefined} onClick={() => h.onDecide("declined")}>{full ? "Keep as draft" : "Decline"}</NetworkButton>
        {approval.kind === "ask_send" && !h.editing && !full ? <GoalButton disabledReason={ended || h.working ? "This approval cannot be edited now" : undefined} onClick={h.onStartEdit}>Edit note</GoalButton> : null}
      </div>
      {blocked ? <p className="mt-3 text-g-meta text-g-ink-2">{blocked}</p> : null}
    </NextStep>
  </article>;
}
