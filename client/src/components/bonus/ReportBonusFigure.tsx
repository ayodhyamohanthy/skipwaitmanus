// D-099 slice A (D-374): the "Report a wrong figure" form opened from the one
// fact line on /explore/:slug (slice B). Signed out it offers the sign-in link
// with a return path; signed in it files the report and shows the server's own
// neutral limit message. No button or wording ever ties a bonus to referring.
import { useState } from "react";
import { GoalButton } from "@/components/goal";
import { BONUS_REPORT_LIMIT_MESSAGE, BONUS_REPORT_REASONS, type BonusReportReason } from "@shared/referralBonus";

const REASON_LABELS: Record<BonusReportReason, string> = {
  figure_changed: "The figure changed",
  source_gone: "The source page is gone",
  not_this_company: "This is not this company's programme",
  other: "Something else",
};

type Props = { slug: string; companyName: string; signedIn: boolean };

export function ReportBonusFigure({ slug, companyName, signedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<BonusReportReason>("figure_changed");
  const [note, setNote] = useState("");
  const [suggestedSourceUrl, setSuggestedSourceUrl] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "limited">("idle");

  const returnTo = `/explore/${encodeURIComponent(slug)}`;

  if (!signedIn) {
    return (
      <a className="text-g-meta text-g-ink-2 underline" href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
        Sign in to report a wrong figure
      </a>
    );
  }

  if (state === "sent") {
    return <p role="status" className="text-g-meta text-g-ink-2">Thank you. We will check {companyName}&apos;s page.</p>;
  }

  if (!open) {
    return (
      <button type="button" className="text-g-meta text-g-ink-2 underline" onClick={() => setOpen(true)}>
        Report a wrong figure
      </button>
    );
  }

  async function submit() {
    setState("sending");
    try {
      const response = await fetch(`/api/company-bonuses/${encodeURIComponent(slug)}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason, note: note.trim() ? note.trim() : null, suggestedSourceUrl: suggestedSourceUrl.trim() ? suggestedSourceUrl.trim() : null }),
      });
      if (response.status === 429) { setState("limited"); return; }
      if (!response.ok) { setState("error"); return; }
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-2 space-y-2 text-g-meta text-g-ink-2">
      <p className="text-g-label text-g-ink">Report a wrong figure for {companyName}</p>
      <label className="block">
        <span className="sr-only">Reason</span>
        <select className="w-full rounded border border-g-hairline bg-white p-2" value={reason} onChange={event => setReason(event.target.value as BonusReportReason)}>
          {BONUS_REPORT_REASONS.map(value => <option key={value} value={value}>{REASON_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Note (optional)</span>
        <textarea className="w-full rounded border border-g-hairline bg-white p-2" maxLength={280} rows={2} placeholder="Anything we should know (optional)" value={note} onChange={event => setNote(event.target.value)} />
      </label>
      <label className="block">
        <span className="sr-only">A better source link (optional)</span>
        <input className="w-full rounded border border-g-hairline bg-white p-2" type="url" inputMode="url" placeholder="https:// (optional)" value={suggestedSourceUrl} onChange={event => setSuggestedSourceUrl(event.target.value)} />
      </label>
      {state === "limited" && <p role="alert">{BONUS_REPORT_LIMIT_MESSAGE}</p>}
      {state === "error" && <p role="alert">We could not send the report. Try again.</p>}
      <div className="flex gap-2">
        <GoalButton size="sm" busy={state === "sending"} busyLabel="Sending" onClick={() => void submit()}>Send report</GoalButton>
        <GoalButton size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</GoalButton>
      </div>
    </div>
  );
}
