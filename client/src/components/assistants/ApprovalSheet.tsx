// Kit v4 /approve sheet (app/src/routes/approve.tsx), driven by a real pending approval.
import { Bot, Check, Coins, Pencil, X } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { creditsLabel, providerLabel, timeAgo, timeLeft, type AssistantApproval } from "./format";

export function Sheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2rem] border border-border bg-card p-5 shadow-xl sm:p-6 ${className}`}>
      <div aria-hidden="true" className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted sm:hidden" />
      {children}
    </div>
  );
}

function SourceLine({ approval, withExpiry }: { approval: AssistantApproval; withExpiry: boolean }) {
  return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Bot className="size-4" />{providerLabel(approval.provider)} · {timeAgo(approval.createdAt)}{withExpiry ? ` · ${timeLeft(approval.expiresAt)}` : ""}</p>;
}

function Title({ primary, children }: { primary: boolean; children: ReactNode }) {
  return primary ? <h1 className="mt-2 text-2xl font-semibold">{children}</h1> : <h2 className="mt-2 text-2xl font-semibold">{children}</h2>;
}

export type ApprovalHandlers = {
  editing: boolean;
  draftNote: string;
  working: boolean;
  actionError: string;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onDecide: (decision: "approved" | "declined") => void;
};

export function ApprovalCard({ approval, balance, primary, handlers }: { approval: AssistantApproval; balance: number | null; primary: boolean; handlers: ApprovalHandlers }) {
  const { editing, draftNote, working, actionError, onDraftChange, onStartEdit, onSaveEdit, onDecide } = handlers;
  const provider = providerLabel(approval.provider);
  const company = approval.companyDomain ?? "this company";
  const slotsFull = approval.kind === "ask_send" && approval.slotCount === 0;
  const error = actionError ? <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{actionError}</p> : null;

  if (approval.kind === "credit_spend") {
    const cost = approval.creditCount ?? 1;
    const after = balance !== null ? Math.max(0, balance - cost) : null;
    const target = [approval.role, approval.companyDomain].filter((part): part is string => Boolean(part)).join(" at ");
    return (
      <Sheet>
        <SourceLine approval={approval} withExpiry />
        <Title primary={primary}>Run this paid tool?</Title>
        <p className="mt-1 text-sm text-muted-foreground">For {target || "your ask"}</p>
        <Panel tone="muted" className="mt-4 flex items-center gap-3"><Coins className="size-6" /><span className="flex-1"><strong className="block">{creditsLabel(cost)}</strong><small className="text-muted-foreground">{balance !== null && after !== null ? `You have ${balance} · ${after} after this` : "The cost shows before anything is spent"}</small></span></Panel>
        {error}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={working} onClick={() => onDecide("declined")}>Not now</Button>
          <Button disabled={working} onClick={() => onDecide("approved")}>Use {creditsLabel(cost)}</Button>
        </div>
      </Sheet>
    );
  }

  if (slotsFull) {
    return (
      <Sheet>
        <SourceLine approval={approval} withExpiry />
        <div className="py-2">
          <Title primary={primary}>All your slots are in use</Title>
          <p className="mt-1 text-sm text-muted-foreground">{provider} saved this ask as a draft for {company}. It can be sent when a request is answered or you withdraw one.</p>
          {error}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button asChild variant="outline"><Link href="/requests">Manage requests</Link></Button>
            <Button disabled={working} onClick={() => onDecide("declined")}>Keep as draft</Button>
          </div>
        </div>
      </Sheet>
    );
  }

  const slotLine = typeof approval.slotCount === "number" && approval.slotCount > 0 ? `uses 1 of your ${approval.slotCount} open slots` : "uses 1 of your open slots";
  const subtitle = [approval.role, slotLine, approval.creditCount ? creditsLabel(approval.creditCount) : null].filter((part): part is string => Boolean(part)).join(" · ");
  return (
    <Sheet>
      <SourceLine approval={approval} withExpiry />
      <Title primary={primary}>Send this ask to {company}?</Title>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {editing ? (
        <label className="mt-4 block"><span className="sr-only">Ask note</span><textarea className="min-h-40 w-full rounded-2xl border border-input bg-background p-4 text-base" value={draftNote} onChange={event => onDraftChange(event.target.value)} /></label>
      ) : (
        <Panel tone="muted" className="mt-4 whitespace-pre-wrap text-sm">{approval.note || <span className="text-muted-foreground">No note yet. Tap Edit to add one.</span>}</Panel>
      )}
      <ul className="mt-3 space-y-1 text-sm">
        <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Assistants draft, you send</li>
        <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Same open-request limits as you</li>
        <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Routed like every ask you send</li>
      </ul>
      {error}
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Button variant="ghost" disabled={working} onClick={() => onDecide("declined")}><X />Decline</Button>
        {editing
          ? <Button variant="outline" disabled={working || !draftNote.trim()} onClick={onSaveEdit}><Pencil />Done</Button>
          : <Button variant="outline" disabled={working} onClick={onStartEdit}><Pencil />Edit</Button>}
        <Button disabled={working} onClick={() => onDecide("approved")}><Check />Send</Button>
      </div>
    </Sheet>
  );
}

export function ApprovalResult({ approval, decision, morePending, onBack }: { approval: AssistantApproval; decision: "approved" | "declined"; morePending: boolean; onBack: () => void }) {
  return (
    <Sheet>
      <SourceLine approval={approval} withExpiry={false} />
      {decision === "approved" ? (
        <div className="py-4 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent"><Check className="size-8 text-primary" /></span>
          <h1 className="mt-3 text-2xl font-semibold">Done</h1>
          <p className="mt-1 text-sm text-muted-foreground">Approved. Track it in Requests.</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/requests">Open requests</Link></Button>
        </div>
      ) : (
        <div className="py-4 text-center">
          <X className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">Declined</h1>
          <p className="mt-1 text-sm text-muted-foreground">Nothing was sent and no credits were used.</p>
        </div>
      )}
      {morePending ? <div className="text-center"><Button variant="link" onClick={onBack}>Back to approvals</Button></div> : null}
    </Sheet>
  );
}
