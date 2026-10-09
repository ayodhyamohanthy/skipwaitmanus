import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Link2, PenLine, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import { isValidTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
import { Button } from "@/components/kit/button";
import { ASK_NOTE_LIMIT, saveAskPrefill } from "@/lib/askPrefill";
import type { LaunchCompany } from "@/lib/companies";

const STEPS = ["Role", "Your fit", "Privacy", "Review"] as const;
const LAST_STEP = STEPS.length - 1;

type RequestDialogProps = { company: LaunchCompany; open: boolean; step: number; onStepChange: (step: number) => void; onOpenChange: (open: boolean) => void };

/**
 * Kit v4 request dialog (app/src/routes/explore.$slug.tsx). It never sends
 * anything: the last step hands the job link and fit note to the real ask
 * composer at /ask, where the seeker attaches a resume and sends.
 */
export function RequestDialog({ company, open, step, onStepChange, onOpenChange }: RequestDialogProps) {
  const [, go] = useLocation();
  const { isSignedIn } = useAuth();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [urlError, setUrlError] = useState(false);
  const hasNote = note.trim().length > 0;

  const next = () => {
    if (step === 0 && !isValidTargetRoleUrl(url)) { setUrlError(true); return; }
    if (step < LAST_STEP) { onStepChange(step + 1); return; }
    saveAskPrefill({ companySlug: company.slug, targetRoleUrl: url, note });
    onOpenChange(false);
    // The fit note survives in tab session storage; signed-out seekers go
    // through job-seeker login first and land back in the ask composer.
    if (isSignedIn) go("/ask");
    else window.location.assign(`/api/auth/workos/sign-in?${new URLSearchParams({ returnTo: "/ask" })}`);
  };

  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="modal-backdrop">
        <DialogPrimitive.Content className="app-dialog request-dialog" aria-describedby={undefined}>
          <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="Close request"><X /></Button></DialogPrimitive.Close>
          <span className="eyebrow">REQUEST TO {company.name.toUpperCase()}</span>
          <DialogPrimitive.Title>{STEPS[step]}</DialogPrimitive.Title>
          <div className="request-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((item, index) => <span key={item} className={index <= step ? "reached" : ""} />)}</div>
          {step === 0 && <div className="request-fields"><label htmlFor="job-url">Job posting link</label><div className="auth-input"><Link2 /><input id="job-url" type="url" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder="https://company.com/jobs/..." value={url} maxLength={2048} aria-invalid={urlError} aria-describedby="job-url-hint" onChange={event => { setUrl(event.target.value); setUrlError(false); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); next(); } }} /></div>{urlError ? <p id="job-url-hint" role="alert">{TARGET_ROLE_URL_ERROR}</p> : <p id="job-url-hint">Use the employer’s official job page where possible.</p>}</div>}
          {step === 1 && <div className="request-fields"><label htmlFor="fit-note">Why are you a strong fit?</label><textarea id="fit-note" rows={5} maxLength={ASK_NOTE_LIMIT} placeholder="Share 2–3 relevant strengths or outcomes. Keep it useful and human." value={note} onChange={event => setNote(event.target.value)} /><span>{note.length} / {ASK_NOTE_LIMIT}</span></div>}
          {step === 2 && <div className="share-preview"><ShieldCheck /><h3>You stay in control.</h3><p>Before acceptance, the referrer sees your role link and note. Your name and resume remain private. After acceptance, you choose what to share in the conversation.</p></div>}
          {step === 3 && <div className="review-request"><span className="company-mark">{company.initials}</span><div><strong>{company.name}</strong><p>{hasNote ? "Job link + fit note + privacy choices" : "Job link + privacy choices · add your fit note next"}</p></div><span className="status-pill">{hasNote ? <><Sparkles />Ready</> : <><PenLine />Draft</>}</span></div>}
          <div className="dialog-footer">{step > 0 && <Button variant="ghost" onClick={() => onStepChange(step - 1)}><ArrowLeft />Back</Button>}<Button onClick={next}>{step < LAST_STEP ? "Continue" : isSignedIn ? "Preview request" : "Sign in to continue"}{step < LAST_STEP ? <ArrowRight /> : <Send />}</Button></div>
          <p className="design-note">NOTHING IS SENT UNTIL YOU CONFIRM</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
