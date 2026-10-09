import { BadgeCheck, CircleAlert, Clock, Copy, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { DeveloperApp } from "@shared/assistant";
import { Button } from "@/components/kit/button";
import { Panel, field } from "@/components/kit/preview-kit";
import { KIND_SHORT, STATUS_META } from "./consoleMeta";

type Props = {
  app: DeveloperApp;
  working: boolean;
  error: string;
  onSubmitForReview: () => void;
  onSaveWebhook: (url: string) => void;
  onEditAndResubmit: () => void;
};

const STATS = [["Connected users", "Shown once live"], ["Asks sent via app", "Shown once live"], ["Approval rate", "Shown once live"]] as const;

export function AppDetails({ app, working, error, onSubmitForReview, onSaveWebhook, onEditAndResubmit }: Props) {
  // In review, rejected and suspended apps open on their status; credentials stay one tap away.
  const [showDetails, setShowDetails] = useState(false);
  const [webhook, setWebhook] = useState(app.webhookUrl ?? "");
  const [copied, setCopied] = useState(false);
  const errorLine = error ? <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null;

  if (app.status === "in_review" && !showDetails) {
    return <Panel className="text-center"><Clock className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">{app.name} is in review</h1><p className="mt-2 text-sm text-muted-foreground">Review for send and profile permissions usually takes 2–5 business days.</p><Button className="mt-4" onClick={() => setShowDetails(true)}>Open test credentials</Button></Panel>;
  }
  if (app.status === "rejected" && !showDetails) {
    return <Panel><ShieldAlert className="size-8 text-destructive" /><h1 className="mt-3 text-2xl font-semibold">Changes needed</h1><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{app.rejectReasons.length > 0 ? app.rejectReasons.map(reason => <li key={reason}>{reason}</li>) : <li>Our team asked for changes. Check your email for details.</li>}</ul><div className="mt-4 flex flex-wrap gap-2"><Button onClick={onEditAndResubmit}>Edit and resubmit</Button><Button variant="ghost" onClick={() => setShowDetails(true)}>Open app details</Button></div></Panel>;
  }
  if (app.status === "suspended" && !showDetails) {
    return <Panel><ShieldAlert className="size-8 text-destructive" /><h1 className="mt-3 text-2xl font-semibold">App suspended</h1><p className="mt-2 text-sm text-muted-foreground">Our safety team suspended this app. Reply to the safety team to appeal.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/help">Contact safety team</Link></Button><Button variant="ghost" onClick={() => setShowDetails(true)}>Open app details</Button></div></Panel>;
  }

  const copyClientId = async () => {
    try { await navigator.clipboard?.writeText(app.clientId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };

  return (
    <>
      <h1 className="flex items-center gap-2 text-3xl font-semibold">{app.name} {app.status === "live" ? <BadgeCheck className="text-primary" /> : null}</h1><p className="text-muted-foreground">{KIND_SHORT[app.kind]} · {app.status === "test" ? "Test mode" : STATUS_META[app.status].label}</p>
      {errorLine}
      {app.status === "test" || app.status === "rejected" ? <Panel className="mt-6"><p className="text-sm text-muted-foreground">Your app is in test mode. Submit it for review to go live with a verified badge. Review usually takes 2–5 business days.</p><Button className="mt-4" disabled={working} onClick={onSubmitForReview}><BadgeCheck />Submit for review</Button></Panel> : null}
      <Panel className="mt-6"><h2 className="font-semibold">Credentials</h2><div className="mt-3 space-y-3 text-sm"><div><small className="text-muted-foreground">Client ID</small><div className="flex gap-2"><code className="flex-1 truncate rounded-xl bg-muted px-3 py-2">{app.clientId}</code><Button variant="outline" size="sm" onClick={() => { void copyClientId(); }}><Copy />{copied ? "Copied" : "Copy"}</Button></div></div><div><small className="text-muted-foreground">Client secret</small><div className="flex gap-2"><code className="flex-1 rounded-xl bg-muted px-3 py-2 text-muted-foreground">Not issued yet</code></div></div></div></Panel>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">{STATS.map(([label, hint]) => <Panel key={label}><small className="text-muted-foreground">{label}</small><strong className="block text-lg">—</strong><small className="text-muted-foreground">{hint}</small></Panel>)}</div>
      <Panel className="mt-4"><h2 className="font-semibold">Webhooks</h2><input className={field} value={webhook} onChange={event => setWebhook(event.target.value)} placeholder="https://instinct.app/hooks/skipwait" aria-label="Webhook URL" /><p className="mt-2 text-xs text-muted-foreground">Events are not sent yet. When they are, each one is signed: verify the signature header before trusting it.</p><Button variant="outline" size="sm" className="mt-3" disabled={working} onClick={() => onSaveWebhook(webhook.trim())}>{working ? "Saving…" : "Save webhook"}</Button></Panel>
      <Panel tone="muted" className="mt-4 text-sm"><strong>Limits:</strong> per user, the same open-request limits as the SkipWait app, and 120 requests/min per token. Members on Max can connect; each ask still needs their own approval.</Panel>
    </>
  );
}
