import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, Link2, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import { isValidTargetRoleUrl, jobLinkFitsCompany, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
import { Button } from "@/components/kit/button";
import { ASK_NOTE_LIMIT, saveAskPrefill } from "@/lib/askPrefill";
import { saveAskDraftRemote } from "@/lib/askDraftApi";
import type { PublicCompany } from "@/lib/companyDirectory";

const STEPS = ["Role", "Your fit", "Privacy", "Review"] as const;
const LAST_STEP = STEPS.length - 1;
const NOTE_REQUIRED = "Add a short note on why you’re a strong fit.";

type RequestDialogProps = { company: Pick<PublicCompany, "slug" | "name" | "initials" | "domains">; open: boolean; step: number; onStepChange: (step: number) => void; onOpenChange: (open: boolean) => void };

/**
 * Kit v4 request dialog (app/src/routes/explore.$slug.tsx). It never sends
 * anything: the last step hands the job link and fit note to the real ask
 * composer at /ask, where the seeker attaches a resume and sends.
 */
export function RequestDialog({ company, open, step, onStepChange, onOpenChange }: RequestDialogProps) {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [urlError, setUrlError] = useState(false);
  const wrongCompany = url.trim() !== "" && isValidTargetRoleUrl(url) && !jobLinkFitsCompany(url, company.domains);
  const [noteError, setNoteError] = useState(false);

  const next = () => {
    if (step === 0 && (!isValidTargetRoleUrl(url) || wrongCompany)) { setUrlError(true); return; }
    // The fit step needs a note, so Review always describes a complete draft.
    if (step === 1 && !note.trim()) { setNoteError(true); return; }
    if (step < LAST_STEP) { onStepChange(step + 1); return; }
    // Same-tab hand-off stays as the fallback if the server draft cannot be saved.
    saveAskPrefill({ companySlug: company.slug, targetRoleUrl: url, note });
    if (!isSignedIn) {
      onOpenChange(false);
      // Signed-out seekers go through job-seeker login first and land back in the ask composer.
      window.location.assign(`/api/auth/workos/sign-in?${new URLSearchParams({ returnTo: "/ask" })}`);
      return;
    }
    void saveDraft();
  };

  const saveDraft = async () => {
    if (saving) return;
    setSaving(true); setSaveError("");
    try {
      await saveAskDraftRemote({ companySlug: company.slug, targetRoleUrl: url.trim(), note: note.trim() }, getToken);
      setSaved(true);
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : "We could not save your draft. Try again."); }
    finally { setSaving(false); }
  };

  const close = (nextOpen: boolean) => { if (!nextOpen) { setSaved(false); setSaveError(""); } onOpenChange(nextOpen); };

  return <DialogPrimitive.Root open={open} onOpenChange={close}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="modal-backdrop">
        <DialogPrimitive.Content className="app-dialog request-dialog" aria-describedby={undefined}>
          <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="Close request"><X /></Button></DialogPrimitive.Close>
          {saved ? <div className="request-done" role="status">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent"><Check className="size-7 text-primary" /></span>
            <DialogPrimitive.Title>Your request is ready.</DialogPrimitive.Title>
            <p>Your request is saved. Review it, add your resume and send it as a full ask. Nothing has been sent and no credit has been used.</p>
            <div className="dialog-footer"><Button variant="ghost" asChild><Link href="/requests" onClick={() => close(false)}>See request tracking</Link></Button><Button asChild><Link href="/ask" onClick={() => close(false)}>Write a full ask <ArrowRight /></Link></Button></div>
          </div> : <>
          <span className="eyebrow">REQUEST TO {company.name.toUpperCase()}</span>
          <DialogPrimitive.Title>{STEPS[step]}</DialogPrimitive.Title>
          <div className="request-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((item, index) => <span key={item} className={index <= step ? "reached" : ""} />)}</div>
          {step === 0 && <div className="request-fields"><label htmlFor="job-url">Job posting link</label><div className="auth-input"><Link2 /><input id="job-url" type="url" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder="https://company.com/jobs/..." value={url} maxLength={2048} aria-invalid={urlError} aria-describedby="job-url-hint" onChange={event => { setUrl(event.target.value); setUrlError(false); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); next(); } }} /></div>{urlError ? <p id="job-url-hint" role="alert">{wrongCompany ? `This link is not from ${company.name}. Paste a job link from ${company.name}’s own careers page.` : TARGET_ROLE_URL_ERROR}</p> : <p id="job-url-hint">Use the employer’s official job page where possible.</p>}</div>}
          {step === 1 && <div className="request-fields"><label htmlFor="fit-note">Why are you a strong fit?</label><textarea id="fit-note" rows={5} maxLength={ASK_NOTE_LIMIT} placeholder="Share 2–3 relevant strengths or outcomes. Keep it useful and human." value={note} aria-invalid={noteError} aria-describedby={noteError ? "fit-note-hint" : undefined} onChange={event => { setNote(event.target.value); setNoteError(false); }} /><span>{note.length} / {ASK_NOTE_LIMIT}</span>{noteError ? <p id="fit-note-hint" role="alert">{NOTE_REQUIRED}</p> : null}</div>}
          {step === 2 && <div className="share-preview"><ShieldCheck /><h3>You stay in control.</h3><p>Before acceptance, the referrer sees your role link and note. Your name and resume remain private. After acceptance, you choose what to share in the conversation.</p></div>}
          {step === 3 && <div className="review-request"><span className="company-mark">{company.initials}</span><div><strong>{company.name}</strong><p>Job link + fit note + privacy choices</p></div><span className="status-pill"><Sparkles />Ready</span></div>}
          <div className="dialog-footer">{step > 0 && <Button variant="ghost" onClick={() => onStepChange(step - 1)}><ArrowLeft />Back</Button>}<Button onClick={next} disabled={saving}>{step < LAST_STEP ? "Continue" : isSignedIn ? "Preview request" : "Sign in to continue"}{step < LAST_STEP ? <ArrowRight /> : <Send />}</Button></div>
          {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
          <p className="design-note">NOTHING IS SENT UNTIL YOU CONFIRM</p>
          </>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
