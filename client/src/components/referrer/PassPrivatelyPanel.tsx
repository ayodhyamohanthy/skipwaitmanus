// "Pass privately" on a kit queue card: the same one-reason private decline as
// the opened request (CandidatePreviewCard), confirmed before anything is sent.
// The caller records it with POST /api/company-referrals/:id/one-click-review.
import { useState } from "react";
import { Button } from "@/components/kit/button";
import { declineReasonOptions, type DeclineReason } from "./CandidatePreviewCard";

export function PassPrivatelyPanel({ working, onConfirm, onCancel }: { working: boolean; onConfirm: (reason: DeclineReason) => void; onCancel: () => void }) {
  const [reason, setReason] = useState<DeclineReason | null>(null);
  const option = declineReasonOptions.find(item => item.value === reason);
  return (
    <div role="group" aria-label="Pass privately" className="rounded-[7px] bg-muted p-4">
      <p className="text-sm font-semibold">{option ? `Pass as “${option.label}”?` : "Pass privately with one reason."}</p>
      <p className="mt-1 text-[13px] leading-[1.7] text-muted-foreground">{option ? `${option.hint} ` : ""}The Job Seeker gets a short private note — never your name.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {declineReasonOptions.map(item => (
          <button key={item.value} type="button" aria-pressed={reason === item.value} disabled={working} onClick={() => setReason(item.value)} className={`min-h-11 rounded-[7px] border px-2 py-2 text-xs font-semibold ${reason === item.value ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"}`}>{item.label}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {reason ? <Button type="button" variant="outline" className="flex-1" disabled={working} onClick={() => onConfirm(reason)}>{working ? "Passing…" : "Confirm pass"}</Button> : null}
        <Button type="button" variant="ghost" className="min-h-11 flex-1" disabled={working} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
