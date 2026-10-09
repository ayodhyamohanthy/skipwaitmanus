import { AlertTriangle, Building2, Check, Clock3, FileText, MailWarning, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { caseAge, type ReviewCase, statusLabel } from "./reviewCases";

/** Kit v4 case detail: evidence, note-gated decisions, recorded outcome and audit trail. */
export function ReviewCaseDetail({ item, note, onNote, deciding, error, onDecide }: { item: ReviewCase; note: string; onNote: (value: string) => void; deciding: boolean; error: string; onDecide: (value: string) => void }) {
  const Icon = item.kind === "report" ? ShieldAlert : item.kind === "verification" ? MailWarning : Building2;
  return <>
    <div className="flex flex-wrap items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-muted"><Icon className="size-5" /></span><div className="min-w-0 flex-1"><span className="text-xs text-muted-foreground">{item.kind.toUpperCase()} · {item.ref} · opened {caseAge(item.createdAt)} ago</span><h1 className="text-2xl font-semibold">{item.title}</h1><p className="text-sm text-muted-foreground">{item.sub}</p></div>{item.kind === "report" && !item.terminal ? item.urgent ? <span className="flex items-center gap-1 text-sm font-semibold text-destructive"><AlertTriangle className="size-4" />SLA 4h</span> : <span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="size-4" />SLA 48h</span> : null}</div>
    <h2 className="mt-6 text-sm font-semibold">Evidence</h2><ul className="mt-2 space-y-2">{item.evidence.map(line => <li key={line} className="flex gap-2 rounded-xl bg-muted p-3 text-sm"><FileText className="size-4 shrink-0" />{line}</li>)}</ul>
    {item.terminal ? <div className="mt-6 rounded-2xl bg-accent p-4 text-accent-foreground"><strong className="flex items-center gap-2"><ShieldCheck className="size-4" />Decision: {statusLabel(item.status)}</strong><p className="mt-1 text-sm">{item.outcome}</p></div> : <>
      <h2 className="mt-6 text-sm font-semibold">Decision</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{item.decisions.map(decision => <button key={decision.value} type="button" disabled={!note.trim() || deciding} onClick={() => onDecide(decision.value)} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left disabled:cursor-not-allowed ${decision.danger ? "border-destructive/40" : "border-border hover:border-foreground/40"}`}>{decision.dismiss ? <X className="size-4 shrink-0" /> : <Check className="size-4 shrink-0" />}<span><strong className="block text-sm">{decision.label}</strong><small className="text-muted-foreground">{decision.detail}</small></span></button>)}</div>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
      <label className="mt-4 block text-sm font-medium">Reviewer note (required)<textarea value={note} maxLength={500} onChange={event => onNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background p-3" placeholder="Why this decision?" /></label>
    </>}
    <h2 className="mt-6 text-sm font-semibold">Audit trail</h2><ol className="mt-2 space-y-1 text-xs text-muted-foreground">{item.audit.map(line => <li key={line}>{line}</li>)}</ol>
  </>;
}
