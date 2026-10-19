// "Pass privately" on a kit queue card: one of the shared pass reasons (D-052), the
// same list as the thread's pass. Nothing is preselected: the referrer picks a reason,
// then confirms before anything is sent. The caller records it with
// POST /api/company-referrals/:id/one-click-review, sending the legacy decline reason
// the server routes on together with the picked reason's code.
import { useState } from "react";
import { PASS_REASON_OPTIONS, passReasonSeekerLabel, type PassReasonCode, type PassReasonOption } from "@shared/passReasons";
import { Button } from "@/components/kit/button";

export function PassPrivatelyPanel({ working, onConfirm, onCancel }: { working: boolean; onConfirm: (reason: PassReasonOption) => void; onCancel: () => void }) {
  const [code, setCode] = useState<PassReasonCode | null>(null);
  const option = PASS_REASON_OPTIONS.find(item => item.code === code);
  const seekerLabel = option ? passReasonSeekerLabel(option.code) : null;
  const note = !option ? "The Job Seeker gets a short private note — never your name."
    : seekerLabel ? `The Job Seeker sees “${seekerLabel}” in a short private note — never your name.`
    : "The Job Seeker gets a short private note without a reason — never your name.";
  return (
    <div role="group" aria-label="Pass privately" className="rounded-[7px] bg-muted p-4">
      <p className="text-sm font-semibold">{option ? `Pass as “${option.label}”?` : "Pass privately with one reason."}</p>
      <p className="mt-1 text-[13px] leading-[1.7] text-muted-foreground">{note}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {PASS_REASON_OPTIONS.map(item => (
          <button key={item.code} type="button" aria-pressed={code === item.code} disabled={working} onClick={() => setCode(item.code)} className={`min-h-11 rounded-[7px] border px-2 py-2 text-xs font-semibold ${code === item.code ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"}`}>{item.label}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {option ? <Button type="button" variant="outline" className="flex-1" disabled={working} onClick={() => onConfirm(option)}>{working ? "Passing…" : "Confirm pass"}</Button> : null}
        <Button type="button" variant="ghost" className="min-h-11 flex-1" disabled={working} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
