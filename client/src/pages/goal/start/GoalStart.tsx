// Goal /start (D-048-p3-start, dark behind goalSurfaceOn('start')). The whole
// screen is the next step: paste the job link, then one black Continue. The
// flow logic is the kit page's verbatim - draft continuity, 450ms debounced
// preview, ambiguous-link domain confirmation, fast-track handoff, bridge
// keys - restyled to the doctrine: no hex fills, no colored banners, status
// as dot + text.
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { GoalButton, GoalField, GoalTextInput } from "@/components/goal";
import { clearReferralDraft, readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { clearPendingResumeFiles } from "@/lib/pendingResume";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl, reviewedEmployerFromTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";

/** Dot + text status line: emerald when the employer is known, amber when the link still needs care. */
function StatusLine({ tone, children }: { tone: "pass" | "warn"; children: React.ReactNode }) {
  return (
    <p role="status" className="mt-3 flex items-start gap-2 text-g-meta text-g-ink-2">
      <span aria-hidden="true" className={`mt-[7px] size-(--g-dot) shrink-0 rounded-full ${tone === "pass" ? "bg-g-emerald" : "bg-g-amber"}`} />
      <span>{children}</span>
    </p>
  );
}

export default function GoalStart() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const referralParams = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const fastTrackCode = referralParams.get("fast")?.trim() || "";
  const fastTrackCompanySlug = referralParams.get("referCompany")?.trim() || "";
  const fastTrackAlias = referralParams.get("referAlias")?.trim() || "";
  const requestIdRef = useRef(0);
  const [name] = useState(() => readReferralDraft()?.name || "");
  const [preview, setPreview] = useState<any>();
  const [previewing, setPreviewing] = useState(false);
  const [confirmedDomain, setConfirmedDomain] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const initialDraft = readReferralDraft();
  const [targetUrl, setTargetUrl] = useState(() => initialDraft?.targetUrl || "");
  const [draftSavedAt, setDraftSavedAt] = useState(() => initialDraft?.updatedAt || 0);
  const validTargetUrl = isValidTargetRoleUrl(targetUrl);
  const reviewedEmployer = validTargetUrl ? reviewedEmployerFromTargetRoleUrl(targetUrl) : undefined;
  const showTargetUrlError = Boolean(targetUrl.trim()) && !validTargetUrl;
  useEffect(() => { if (targetUrl) saveReferralDraft({ name, targetUrl }); }, [name, targetUrl]);
  const clearAndStartNew = async () => { if (isSignedIn) { const token = await getToken(); const response = await fetch("/api/documents/draft", { method: "DELETE", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) { setPreviewError("We could not clear the saved resume. Try again."); return; } } await clearPendingResumeFiles().catch(() => undefined); clearReferralDraft(); localStorage.removeItem("bridge-target-url"); localStorage.removeItem("bridge-target-compensation"); localStorage.removeItem("bridge-seeker-attachments"); localStorage.removeItem("skipwait-job-source"); setTargetUrl(""); setDraftSavedAt(0); setPreview(undefined); setPreviewError(""); };
  const draftAge = draftSavedAt ? (() => { const minutes = Math.max(0, Math.floor((Date.now() - draftSavedAt) / 60000)); return minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; })() : "";
  const fromSampleRole = typeof window !== "undefined" && window.localStorage.getItem("skipwait-job-source") === "sample";
  useEffect(() => {
    const requestId=++requestIdRef.current; const controller=new AbortController(); setPreview(undefined); setConfirmedDomain(""); setPreviewError("");
    if (!validTargetUrl) { setPreviewing(false); return()=>controller.abort(); }
    const expectedCanonical=normalizeTargetRoleUrl(targetUrl); setPreviewing(true);
    const timer=setTimeout(async()=>{ try { const response=await fetch("/api/job-link/preview",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:targetUrl}),signal:controller.signal}); const payload=response.ok?await response.json():undefined; if(requestId!==requestIdRef.current) return; if(payload?.canonicalUrl===expectedCanonical) setPreview(payload); else { setPreview(undefined); setPreviewError("We couldn't verify this job link. Check your connection, then try again."); } } catch { if(requestId===requestIdRef.current){ setPreview(undefined); setPreviewError("We couldn't verify this job link. Check your connection, then try again."); } } finally { if(requestId===requestIdRef.current)setPreviewing(false); } },450);
    return()=>{clearTimeout(timer);controller.abort()};
  },[targetUrl,validTargetUrl,retryNonce]);
  const previewHasSafeEmployer = Boolean(preview?.companyDomain) && ["direct-domain", "verified"].includes(preview?.employerConfidence);
  // Company identification runs in the background (#57): Continue is enabled
  // as soon as the link is valid. Only a finished lookup that could not safely
  // name the employer (ambiguous, or unreachable without a safe employer) asks
  // for the company domain here. The server re-resolves the employer on send
  // and refuses to notify anyone when it cannot, so no request reaches the
  // wrong employer.
  const domainLooksValid = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(confirmedDomain.trim());
  const previewNeedsDomain = Boolean(validTargetUrl && preview && preview.canonicalUrl === normalizeTargetRoleUrl(targetUrl) && (preview.employerConfidence === "ambiguous" || (preview.status === "unreachable" && !previewHasSafeEmployer)));
  const previewOk = Boolean(validTargetUrl && !(previewNeedsDomain && !domainLooksValid));
  // The preview service can fail (offline, rate limit, provider outage) while
  // the link itself is fine. Fall back to the reviewed static employer match
  // instead of stranding the seeker on a disabled Continue.
  const canBegin = previewOk;
  const begin = () => { if (!canBegin) return; const normalizedTargetUrl = normalizeTargetRoleUrl(targetUrl); if (normalizedTargetUrl !== normalizeTargetRoleUrl(readReferralDraft()?.targetUrl || "")) localStorage.removeItem("bridge-target-compensation"); localStorage.setItem("bridge-name", name || localStorage.getItem("bridge-name") || "Candidate"); localStorage.setItem("bridge-target-url", normalizedTargetUrl); localStorage.setItem("bridge-company-confirmation", JSON.stringify({ canonicalUrl: normalizedTargetUrl, confirmedDomain: confirmedDomain.trim().toLowerCase() })); saveReferralDraft({ name, targetUrl: normalizedTargetUrl }); const next = fastTrackCode ? `/request?fast=${encodeURIComponent(fastTrackCode)}` : fastTrackCompanySlug && fastTrackAlias ? `/request?referCompany=${encodeURIComponent(fastTrackCompanySlug)}&referAlias=${encodeURIComponent(fastTrackAlias)}` : "/request"; go(next); };

  return (
    <main data-skipwait-screen="onboarding" data-testid="goal-start" className="g-scope flex min-h-dvh flex-col bg-g-surface px-4 text-g-ink gdesk:px-6">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3">
          <GoalButton variant="ghost" flush leadingIcon={ArrowLeft} onClick={() => go("/")}>Back</GoalButton>
          <AccountMenu />
        </header>
        <section className="flex flex-1 flex-col justify-center py-6">
          {fastTrackCode || (fastTrackCompanySlug && fastTrackAlias) ? <p className="text-g-badge uppercase tracking-[0.12em] text-g-ink-3">Private referral path</p> : null}
          <h1 className="mt-3 text-g-display text-g-ink">Paste the job link.</h1>
          <p className="mt-3 max-w-sm text-g-body text-g-ink-2">We match it privately to the company. Your resume comes next.</p>

          {draftSavedAt && targetUrl ? (
            <p className="mt-6 flex flex-wrap items-center justify-between gap-3 text-g-meta text-g-ink-2">
              <span>Draft saved on this device · {draftAge}{fromSampleRole ? " · From Sample role" : ""}</span>
              <GoalButton variant="ghost" size="sm" flush onClick={() => { void clearAndStartNew(); }}>Clear and start new</GoalButton>
            </p>
          ) : null}

          <div className={draftSavedAt && targetUrl ? "mt-3" : "mt-8"}>
            <GoalField label="Target Role URL" htmlFor="goal-start-url" error={showTargetUrlError ? TARGET_ROLE_URL_ERROR : undefined}>
              <GoalTextInput
                id="goal-start-url"
                autoFocus
                type="url"
                inputMode="url"
                enterKeyHint="next"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={targetUrl}
                onChange={event => setTargetUrl(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); begin(); } }}
                placeholder="https://company.com/careers/role"
                invalid={showTargetUrlError}
              />
            </GoalField>
          </div>

          {previewNeedsDomain ? (
            <div className="mt-3">
              <GoalField label="Company domain" htmlFor="goal-start-domain" help="The link matches several companies. Name the employer's domain so the right team gets it.">
                <GoalTextInput id="goal-start-domain" value={confirmedDomain} onChange={event => setConfirmedDomain(event.target.value)} placeholder="company.com" />
              </GoalField>
            </div>
          ) : null}

          {previewing ? <p className="mt-3 text-g-meta text-g-ink-3">Checking the link…</p> : null}

          {preview ? (
            <StatusLine tone={preview.companyDomain ? "pass" : "warn"}>
              {preview.status === "unreachable" && previewHasSafeEmployer
                ? <>Company identified as {preview.companyDomain}; we couldn&apos;t verify this page is still open. Check the link before sending.</>
                : preview.companyDomain
                  ? <>Company identified: {preview.companyName || preview.companyDomain}</>
                  : <>{preview.reason} {preview.recoveryAction}</>}
            </StatusLine>
          ) : null}

          {reviewedEmployer && !preview ? (
            <StatusLine tone="pass">Company identified: {reviewedEmployer.name}</StatusLine>
          ) : null}

          {previewError && !preview ? (
            <p role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-g-meta text-g-ink-2">
              <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-crimson" />
              <span>{previewError}</span>
              <GoalButton variant="ghost" size="sm" flush onClick={() => setRetryNonce(current => current + 1)}>Try again</GoalButton>
            </p>
          ) : null}
        </section>
        <footer className="shrink-0 border-t border-g-hairline pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
          {showTargetUrlError ? <p id="continue-hint" className="mb-2 text-center text-g-meta text-g-crimson">Fix the link above to continue</p> : null}
          <GoalButton
            variant="primary"
            className="w-full"
            disabledReason={!canBegin ? (showTargetUrlError ? "Fix the link above to continue" : "Paste the job link to continue") : undefined}
            onClick={begin}
          >
            Continue
          </GoalButton>
        </footer>
      </div>
    </main>
  );
}
