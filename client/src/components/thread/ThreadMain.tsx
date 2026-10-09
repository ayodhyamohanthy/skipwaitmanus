import { Clock3, ExternalLink, EyeOff, FileText, Send, UserRound } from "lucide-react";
import { Button } from "@/components/kit/button";
import { StatusPill } from "@/components/kit/status-pill";
import type { ThreadMessage, ThreadRequest, ThreadRole } from "@/lib/threadApi";
import { canMessage, companyInitials, companyName, isAccepted, seekerWaitingCopy, STAGES, stageIndex, stageOf } from "./threadModel";

function Notice({ tone, title, text }: { tone: "muted" | "accent"; title: string; text: string }) {
  return <div className={`rounded-2xl p-4 ${tone === "accent" ? "bg-accent text-accent-foreground" : "bg-muted"}`}><strong>{title}</strong><p className="mt-1 text-sm">{text}</p></div>;
}

type Props = {
  request: ThreadRequest;
  role: ThreadRole;
  /** The seeker's own name and headline, shown on their own ask. */
  seekerIdentity: { name: string | null; headline: string | null };
  passed: boolean;
  messages: readonly ThreadMessage[];
  draft: string;
  setDraft: (value: string) => void;
  sending: boolean;
  sendError: string;
  onSend: () => void;
};

function askerLabel(role: ThreadRole, request: ThreadRequest, seeker: Props["seekerIdentity"]): string {
  if (role === "referrer-pending") return "Seeker · identity hidden";
  if (role === "referrer-claimed") return request.candidateName ?? "Seeker";
  if (seeker.name) return seeker.headline ? `${seeker.name} · ${seeker.headline}` : seeker.name;
  return "Your ask";
}

export function ThreadMain({ request, role, seekerIdentity, passed, messages, draft, setDraft, sending, sendError, onSend }: Props) {
  const stage = stageOf(request);
  const idx = stageIndex(stage);
  const company = companyName(request.companyDomain);
  const accepted = isAccepted(request);
  const hidden = role === "referrer-pending";
  const seeker = role === "seeker";
  const composer = canMessage(role, request);

  return (
    <section className="min-w-0 rounded-3xl border border-border bg-card">
      <header className="flex flex-wrap items-start gap-3 border-b border-border p-5">
        <span className="company-mark">{companyInitials(request.companyDomain)}</span>
        <div className="min-w-0 flex-1">
          <span className="eyebrow">{company}</span>
          <h1 className="text-2xl font-semibold">{request.title ?? "Referral request"}</h1>
          {request.targetRoleUrl ? <a href={request.targetRoleUrl} target="_blank" rel="noreferrer" className="text-link mt-1 inline-flex items-center gap-1 text-sm">Official job posting <ExternalLink className="size-3.5" /></a> : null}
        </div>
        <StatusPill status={stage} />
      </header>

      <ol className="flex gap-1 overflow-x-auto border-b border-border px-5 py-4" aria-label="Request progress">
        {STAGES.map((label, i) => (
          <li key={label} className="min-w-16 flex-1">
            <span className={`block h-1.5 rounded-full ${idx >= i ? "bg-primary" : "bg-muted"}`} />
            <span className={`mt-1.5 block text-[11px] ${idx === i ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">{hidden ? <EyeOff className="size-5" /> : <UserRound className="size-5" />}</span>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-muted p-4">
            <strong className="text-sm">{askerLabel(role, request, seekerIdentity)}</strong>
            {request.pitch ? <p className="mt-1 break-words">&quot;{request.pitch}&quot;</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {!accepted ? (
                <span className="flex items-center gap-1 rounded-full bg-background px-3 py-1"><EyeOff className="size-3.5" />Resume and profile shared after acceptance</span>
              ) : role === "referrer-claimed" ? (
                request.attachments.map(file => (
                  <a key={file.id} href={file.url ?? `/api/documents/${file.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-background px-3 py-1"><FileText className="size-3.5" />{file.fileName}</a>
                ))
              ) : request.attachmentCount > 0 ? (
                <span className="flex items-center gap-1 rounded-full bg-background px-3 py-1"><FileText className="size-3.5" />{request.attachmentCount === 1 ? "1 file shared" : `${request.attachmentCount} files shared`}</span>
              ) : null}
            </div>
          </div>
        </div>

        {stage === "Requested" && seeker ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4 shrink-0" />{seekerWaitingCopy(request)}</p> : null}
        {stage === "Requested" && !seeker && !passed ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4 shrink-0" />No reply needed to pass — but a quick answer helps.</p> : null}
        {passed ? <Notice tone="muted" title="You passed privately." text="The request stays active for other verified employees. Your identity was never revealed." /> : null}
        {stage === "Declined" ? <Notice tone="muted" title="This referrer passed." text={request.referrerMessage ?? `It's not a judgment of you. Your slot is open again — try another verified referrer at ${company}.`} /> : null}
        {stage === "Expired" ? <Notice tone="muted" title="This request expired." text="Nobody could take it within 7 days. Your slot is free — refresh your note and ask again." /> : null}
        {stage === "Withdrawn" ? <Notice tone="muted" title="You withdrew this request." text="Your credit was returned to your balance." /> : null}

        {accepted ? <p className="text-center text-xs text-muted-foreground">— {seeker ? "Request accepted. You can now message privately." : "Request accepted. Their name and resume are now shared."} —</p> : null}
        {messages.map(message => (
          <div key={message.id} className={`flex ${message.isMine ? "justify-end" : ""}`}>
            <p className={`max-w-[80%] break-words rounded-2xl px-4 py-2.5 ${message.isMine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"}`}>{message.body}</p>
          </div>
        ))}
        {stage === "Referred" ? <Notice tone="accent" title="Referral submitted" text={`Submitted through ${company}'s internal referral process. Companies decide hiring; SkipWait never promises outcomes.`} /> : null}
        {stage === "Hired" ? <Notice tone="accent" title="Hired. Congratulations." text={seeker ? "Thank your referrer, then pay it forward — become a referrer once you're verified." : "Thank you for opening this door."} /> : null}
      </div>

      {composer ? (
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) onSend(); }} placeholder="Write a message…" aria-label="Message" maxLength={3000} className="h-12 min-w-0 flex-1 rounded-full border border-input bg-background px-4" />
            <Button size="icon" className="size-12 rounded-full" aria-label="Send" disabled={sending} onClick={onSend}><Send /></Button>
          </div>
          {sendError ? <p role="alert" className="mt-2 text-sm text-destructive">{sendError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
