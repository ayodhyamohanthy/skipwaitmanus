// Ask drawer (design/goal-ui/pick/find-a-referral + content.json screenA.askDrawer):
// docked 480px column on desktop, full-height sheet on phone (GoalDrawer).
// Send path mirrors Ask.tsx minus the optional fields the comp does not draw
// (compensation, job function, location, D-022 post attach, fast-track): the
// comp's "Why me" three reasons compose into the single server note field.
import { Bell, FileText, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { isValidTargetRoleUrl } from "@shared/referralUrl";
import type { PublicCompany } from "@shared/companies";
import { GoalDrawer } from "@/components/goal/GoalDrawer";
import { GoalField } from "@/components/goal/GoalField";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNum } from "@/components/goal/GoalNum";
import { GoalVerifiedMark } from "@/components/goal/GoalVerifiedMark";
import { countWords } from "@/components/ask/AskStrength";
import { askErrorMessage } from "@/components/ask/askApi";
import { readApiJson } from "@/lib/apiResponse";
import { saveAskDraftRemote } from "@/lib/askDraftApi";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";
import { fill, goalCopy } from "@shared/i18n/en";

const copy = goalCopy.askDrawer;

const REASON_LIMIT = 140;
const IDEMPOTENCY_KEY = "goal-ask-idempotency";
function idempotencyKey(): string {
  const existing = sessionStorage.getItem(IDEMPOTENCY_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(IDEMPOTENCY_KEY, created);
  return created;
}

export function GoalAskDrawer({ company, open, onOpenChange }: { company: PublicCompany; open: boolean; onOpenChange(open: boolean): void }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [, navigate] = useLocation();
  const [url, setUrl] = useState("");
  const [reasons, setReasons] = useState(["", "", ""]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resume, setResume] = useState<ResumeDoc | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved">("idle");
  const [credits, setCredits] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Fresh composer per company, and the live seeker credit balance for the cost line.
  useEffect(() => {
    setUrl(""); setReasons(["", "", ""]); setResumeFile(null); setResume(null); setError(""); setDraftState("idle");
  }, [company.slug, open]);
  useEffect(() => {
    if (!open || !isSignedIn) return;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = (await response.json()) as { totalAvailable?: number };
        if (response.ok && typeof payload.totalAvailable === "number") setCredits(payload.totalAvailable);
      } catch { /* the cost line still shows, without a count */ }
    })();
  }, [open, isSignedIn, getToken]);

  const officialUrl = isValidTargetRoleUrl(url || undefined);
  // Match hint + confirmation: the job link's host sits on one of the company's own domains.
  const matchedDomain = (() => {
    if (!officialUrl) return null;
    try {
      const host = new URL(url.trim()).hostname.toLowerCase();
      return company.domains.find(domain => host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`)) ?? null;
    } catch { return null; }
  })();
  const note = reasons.map(reason => reason.trim()).filter(Boolean).join("\n");
  const ready = Boolean(officialUrl && countWords(note) >= 10 && (resume || resumeFile));

  const ensureResume = async (): Promise<ResumeDoc> => {
    if (resume) return resume;
    if (!resumeFile) throw new Error(copy.errors.send);
    const uploaded = await uploadResume(resumeFile, getToken);
    setResume(uploaded); setResumeFile(null);
    return uploaded;
  };

  const send = async () => {
    if (!ready || sending) return;
    setError(""); setSending(true);
    try {
      const doc = await ensureResume();
      const token = await getToken();
      const body: Record<string, string | number[]> = { targetRoleUrl: url.trim(), attachmentIds: [doc.id], candidateMessage: note, companySlug: company.slug };
      if (matchedDomain) body.confirmedCompanyDomain = matchedDomain;
      const response = await fetch("/api/company-referrals", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      const payload = await readApiJson<Record<string, unknown>>(response, copy.errors.send);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : copy.errors.send);
      sessionStorage.removeItem(IDEMPOTENCY_KEY);
      onOpenChange(false);
      navigate("/requests");
    } catch (reason) { setError(askErrorMessage(reason, copy.errors.send)); }
    finally { setSending(false); }
  };

  // Cmd+Enter / Ctrl+Enter sends once the link and reasons pass their checks (content.json shortcut).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void send(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const saveDraft = async () => {
    if (draftState === "saving") return;
    setDraftState("saving");
    try { await saveAskDraftRemote({ companySlug: company.slug, targetRoleUrl: url.trim(), note }, getToken); setDraftState("saved"); }
    catch { setDraftState("idle"); setError(copy.errors.draftSave); }
  };

  const intro = (
    <div className="grid gap-2">
      {company.openToReferrals ? <GoalVerifiedMark>{fill(copy.verifiedLine, { company: company.name })}</GoalVerifiedMark> : null}
      <p className="text-g-meta text-g-ink-2 text-pretty">{copy.privacyNote}</p>
      <a href={`/explore/${company.slug}`} className="text-g-meta text-g-ink-3 underline underline-offset-2 hover:text-g-ink-2">{copy.seeOpenRoles}</a>
    </div>
  );

  const [arming, setArming] = useState(false);
  const armAlert = async () => {
    if (arming) return;
    setError(""); setArming(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/seeker-alerts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ companyDomain: company.domains[0] }) });
      const payload = await readApiJson<Record<string, unknown>>(response, copy.errors.alertSave);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : copy.errors.alertSave);
      onOpenChange(false);
      navigate("/alerts");
    } catch (reason) { setError(askErrorMessage(reason, copy.errors.alertSave)); }
    finally { setArming(false); }
  };

  const closedBody = (
    <div className="grid gap-3">
      <p className="text-g-body text-g-ink text-pretty">{fill(copy.closedBody, { company: company.name })}</p>
      {isSignedIn
        ? <GoalButton variant="outline" busy={arming} onClick={() => { void armAlert(); }}><Bell aria-hidden="true" className="size-4" strokeWidth={1.75} />{copy.closedCta}</GoalButton>
        : <SignInButton><GoalButton variant="outline"><Bell aria-hidden="true" className="size-4" strokeWidth={1.75} />{copy.closedCta}</GoalButton></SignInButton>}
      <p className="text-g-meta text-g-ink-3">{copy.closedFootnote}</p>
      {error ? <p role="alert" className="text-g-meta text-g-ink-2">{error}</p> : null}
    </div>
  );

  const signedOutBody = (
    <div className="grid gap-3">
      <p className="text-g-body text-g-ink text-pretty">{fill(copy.signedOutBody, { company: company.name })}</p>
      <SignInButton><GoalButton variant="primary">{copy.signedOutCta}</GoalButton></SignInButton>
    </div>
  );

  const form = (
    <>
      <GoalField label={copy.jobLinkLabel} htmlFor="goal-ask-url"
        hint={matchedDomain ? { icon: FileText, tone: "pass", text: fill(copy.matchHint, { company: company.name }) } : undefined}
        error={url && !officialUrl ? copy.errors.invalidUrl : undefined}>
        <input id="goal-ask-url" type="url" inputMode="url" autoCapitalize="none" spellCheck={false}
          value={url} maxLength={2048} placeholder={copy.jobLinkPlaceholder}
          onChange={event => setUrl(event.target.value)}
          className="h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3 max-gdesk:h-12" />
      </GoalField>
      <GoalField label={copy.resumeLabel} hint={{ icon: Lock, tone: "muted", text: copy.resumeHint }}>
        <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-g-control border border-g-hairline px-3.5 py-2">
          <FileText aria-hidden="true" className="size-5 text-g-ink-2" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block truncate text-g-body text-g-ink">{resume?.fileName ?? resumeFile?.name ?? copy.resumeEmpty}</span>
          </span>
          <GoalButton variant="ghost" size="xs" onClick={() => fileInput.current?.click()}>{copy.resumeChange}</GoalButton>
        </div>
        <input ref={fileInput} type="file" accept="application/pdf" className="hidden" aria-label="Choose resume PDF"
          onChange={event => { const file = event.target.files?.[0]; if (!file) return; const invalid = validateResumeFile(file); if (invalid) { setError(invalid); return; } setError(""); setResumeFile(file); setResume(null); }} />
      </GoalField>
      <GoalField label={copy.whyMeLabel} help={copy.whyMeHelper}>
        <div className="grid gap-2">
          {reasons.map((reason, index) => (
            <div key={index} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-g-control border border-g-control-edge bg-g-surface px-3 pb-2 pt-3 focus-within:border-g-ink">
              <GoalNum className="leading-6 text-g-ink-3">{String(index + 1).padStart(2, "0")}</GoalNum>
              <textarea rows={2} value={reason} maxLength={REASON_LIMIT} aria-label={`Why me ${index + 1}`}
                placeholder={index === 2 ? copy.reasonPlaceholder3 : undefined}
                onChange={event => setReasons(current => current.map((item, at) => (at === index ? event.target.value : item)))}
                className="w-full resize-none text-g-body text-g-ink placeholder:text-g-ink-3 focus:outline-none" />
              <GoalNum className="col-start-2 justify-self-end text-g-ink-3">{reason.length}/{REASON_LIMIT}</GoalNum>
            </div>
          ))}
        </div>
      </GoalField>
      {error ? <p role="alert" className="text-g-meta text-g-ink-2">{error}</p> : null}
    </>
  );

  const footer = (
    <div className="grid gap-1">
      <p className="text-g-label text-g-ink">{credits === null ? fill(copy.costLine, { count: "…" }) : <>Uses <GoalNum>1</GoalNum> of your <GoalNum>{credits}</GoalNum> credits</>}</p>
      <p className="text-g-meta text-g-ink-2 text-pretty">{copy.costDetail}</p>
      <div className="mt-4 flex items-center justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-[1fr_2fr]">
        <GoalButton variant="ghost" busy={draftState === "saving"} onClick={() => { void saveDraft(); }}>{draftState === "saved" ? copy.draftSaved : copy.saveDraft}</GoalButton>
        <GoalButton variant="primary" busy={sending} busyLabel={copy.sending} keys={[{ icon: "command" }, { icon: "corner-down-left" }]}
          disabledReason={!ready ? copy.sendDisabledReason : undefined} onClick={() => { void send(); }}>
          {copy.send}
        </GoalButton>
      </div>
    </div>
  );

  const body = !company.openToReferrals ? closedBody : isLoaded && !isSignedIn ? signedOutBody : form;
  return (
    <GoalDrawer open={open} onOpenChange={onOpenChange} title={copy.title} context={company.name} closeLabel="Close" footer={company.openToReferrals && isSignedIn ? footer : <span />}>
      {intro}
      {body}
    </GoalDrawer>
  );
}
