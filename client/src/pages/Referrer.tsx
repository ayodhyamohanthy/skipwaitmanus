import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth, useUser } from "@/_core/auth";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/kit/button";
import { coverageInviteSessionKey } from "@/components/WorkEmailSignIn";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { ReferrerWorkspace } from "@/components/referrer/ReferrerWorkspace";
import { ReferrerOverview } from "@/components/referrer/ReferrerOverview";
import { ReferrerSignInDialog, consumeReferrerOtpLanding } from "@/components/referrer/ReferrerSignInDialog";
import { CapacitySettingsPanel } from "@/components/referrer/CapacitySettingsPanel";
import { ClaimedReview, DecisionRecorded, ReviewFrame, type ClaimedCompanyRequest } from "@/components/referrer/ClaimedReview";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { isCompanyEmail } from "@/lib/workEmail";

export { ReferralCoverageInviteBanner } from "@/components/referrer/CoverageInviteBanner";

type CompanyInboxItem = { id: number; targetRoleUrl: string; companyDomain: string; createdAt: string; attachmentCount: number };
type CompanyResponse = { error?: string; reward?: { rewarded?: boolean }; request?: ClaimedCompanyRequest; requests?: CompanyInboxItem[] };

const alertClass = "rounded-[8px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive";

export default function Referrer() {
  const [, go] = useLocation();
  const params = new URLSearchParams(useSearch());
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const inviteCompany = params.get("company")?.trim().toLowerCase() || "";
  const inviteCode = params.get("invite")?.trim() || "";
  const claimedRequestId = Number(params.get("request"));
  const hasClaimedRequestId = Number.isInteger(claimedRequestId) && claimedRequestId > 0;
  const view = params.get("view") === "setup" ? "setup" : "overview";
  const safeReturnTo = params.get("returnTo") === "/post-opportunity" ? "/post-opportunity" : "";
  const wantsSignIn = Boolean(inviteCompany || params.get("setup") === "work-email" || safeReturnTo || hasClaimedRequestId);
  const employeeSignInEmail = typeof window === "undefined" ? "" : window.sessionStorage.getItem("skipwait:employee-sign-in-email")?.trim().toLowerCase() || "";
  // The OTP-first referrer sign-in (ReferrerOtpSignIn) enrolls the verified
  // company email on the server and never writes the legacy
  // "skipwait:employee-sign-in-email" sessionStorage key. After its reload the
  // session email IS the verified work email, so derive enrollment from the
  // compat session (tRPC auth.me) instead of that key — otherwise this screen
  // re-shows the "Continue with work email" card and its button signs the
  // fresh session out. The sessionStorage key stays as the fallback for the
  // legacy WorkEmailSignIn flow (/email-review/:token via EmailReviewAction).
  const sessionEmail = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || "";
  const sessionEmailIsCompany = Boolean(sessionEmail) && isCompanyEmail(sessionEmail);
  const [signInOpen, setSignInOpen] = useState(wantsSignIn);
  const [signInDismissed, setSignInDismissed] = useState(false);
  const [decision, setDecision] = useState<"" | "approved" | "declined">("");
  const [deciding, setDeciding] = useState(false);
  const [message, setMessage] = useState("");
  const [activeDocument, setActiveDocument] = useState(0);
  const [inbox, setInbox] = useState<CompanyInboxItem[]>([]);
  const [inboxReady, setInboxReady] = useState(false);
  const [claimedRequest, setClaimedRequest] = useState<ClaimedCompanyRequest | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [workEmailError, setWorkEmailError] = useState("");
  const [coverageRewardMessage, setCoverageRewardMessage] = useState("");
  const [employeeEnrollmentReady, setEmployeeEnrollmentReady] = useState(false);
  const [showWorkEmailEnrollment, setShowWorkEmailEnrollment] = useState(true);
  useEffect(() => {
    // /referrer is the public employee entry point, so it carries its own title
    // instead of inheriting the current shell metadata.
    applySeo({ title: "Verify a work email to review private referrals", description: "Verify a company email once, then review private referral requests for your own company and choose whether to help. Reviewing is always free.", path: "/referrer" });
  }, []);
  useEffect(() => {
    // /referrer is the employee login door: signed-out visitors meet the
    // work-email OTP step first (dismissible; the overview stays behind it).
    // Deep links (?setup=work-email, invites, claimed requests) already open
    // it via wantsSignIn; the setup tab keeps its own inline sign-in action.
    if (isLoaded !== false && !isSignedIn && !signInDismissed && view !== "setup") setSignInOpen(true);
  }, [isLoaded, isSignedIn, signInDismissed, view]);

  const companyFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    const response = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "include" });
    const payload = await readApiJson<CompanyResponse>(response, "We could not complete that private company request");
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };

  useEffect(() => {
    if (!isSignedIn) { setEmployeeEnrollmentReady(false); return; }
    if (!employeeSignInEmail) {
      setEmployeeEnrollmentReady(true);
      if (sessionEmailIsCompany) {
        // Signed in and the session email is already a company address: the
        // server verified + enrolled it during /api/auth/otp/verify. Hide the
        // legacy "Continue with work email" card (its only action would sign
        // the fresh OTP session out) and let the inbox load directly.
        setShowWorkEmailEnrollment(false);
        setWorkEmailError("");
      }
      return;
    }
    let active = true;
    const savedInviteCode = typeof window === "undefined" ? "" : window.sessionStorage.getItem(coverageInviteSessionKey) || "";
    setEmployeeEnrollmentReady(false);
    void companyFetch("/api/company-referrals/verify-work-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: employeeSignInEmail, inviteCode: savedInviteCode || undefined }) }).then(payload => {
      if (!active) return;
      if (payload.reward?.rewarded) setCoverageRewardMessage("Welcome credit added. You and the person who invited you each received one referral credit.");
      if (savedInviteCode) window.sessionStorage.removeItem(coverageInviteSessionKey);
      setShowWorkEmailEnrollment(false); setWorkEmailError("");
    }).catch(error => { if (active) setWorkEmailError(error instanceof Error ? error.message : "We could not confirm this company email for private referral access."); }).finally(() => { if (active) setEmployeeEnrollmentReady(true); });
    return () => { active = false; };
  }, [isSignedIn, employeeSignInEmail, sessionEmailIsCompany]);

  useEffect(() => {
    // The setup tab reads its own settings; the overview and a claimed review need the inbox.
    if (!isSignedIn || claimedRequest || !employeeEnrollmentReady || (view === "setup" && !hasClaimedRequestId)) return;
    let active = true;
    const path = hasClaimedRequestId ? `/api/company-referrals/${claimedRequestId}` : "/api/company-referrals/inbox";
    void companyFetch(path).then(payload => {
      if (!active) return;
      if (hasClaimedRequestId) { setClaimedRequest(payload.request || null); setActiveDocument(0); }
      else setInbox(payload.requests || []);
    }).catch((error: unknown) => {
      if (!active) return;
      if (hasClaimedRequestId) setInboxError("This private request is not available to your verified employee account.");
      else if (sessionEmailIsCompany) {
        // The session email is the verified company address (OTP enrollment ran
        // server-side), so a failure here is transient/specific — surface it
        // without the "verify your work email" mask. Never flash the
        // enrollment card or sign the user out for this.
        setInboxError(error instanceof Error ? error.message : "We could not load private company requests.");
      } else setInboxError("Verify your work email to view private company requests.");
    }).finally(() => { if (active) setInboxReady(true); });
    return () => { active = false; };
  }, [isSignedIn, claimedRequest, claimedRequestId, employeeEnrollmentReady, sessionEmailIsCompany, view]);

  // Post-sign-in landing: a referrer who just finished the work-email sign-in
  // (OTP dialog marker, legacy enrollment key, or an explicit returnTo) lands in
  // the inbox as before. Later visits keep the workspace overview reachable.
  useEffect(() => {
    if (!isSignedIn || !inboxReady || claimedRequest || showWorkEmailEnrollment || hasClaimedRequestId || inboxError || view !== "overview") return;
    if (employeeSignInEmail || safeReturnTo || consumeReferrerOtpLanding()) go(safeReturnTo || "/inbox");
  }, [claimedRequest, employeeSignInEmail, go, hasClaimedRequestId, inboxError, inboxReady, isSignedIn, safeReturnTo, showWorkEmailEnrollment, view]);

  const decide = async (approved: boolean) => {
    if (!claimedRequest || deciding) return;
    setDeciding(true); setInboxError("");
    try {
      await companyFetch(`/api/company-referrals/${claimedRequest.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: approved ? "approved" : "declined", message: message.trim() || undefined }) });
      setDecision(approved ? "approved" : "declined");
    } catch (error) { setInboxError(error instanceof Error ? error.message : "We could not record this referral decision"); }
    finally { setDeciding(false); }
  };
  const switchToWorkEmail = async () => { setWorkEmailError(""); try { await signOut?.(); } catch { setWorkEmailError("We could not switch accounts. Try signing out from the account menu, then use your company email."); } };
  const claim = async (requestId: number) => { setClaimingId(requestId); setInboxError(""); try { await companyFetch(`/api/company-referrals/${requestId}/claim`, { method: "POST" }); go(`/referrer?request=${requestId}`); } catch (error) { setInboxError(error instanceof Error ? error.message : "This request is no longer available"); } finally { setClaimingId(null); } };
  const setUp = () => { if (isSignedIn) go("/referrer-setup"); else setSignInOpen(true); };

  if (decision) return <DecisionRecorded decision={decision} request={claimedRequest} onMessage={requestId => go(`/conversation/${requestId}?from=inbox`)} />;

  if (isSignedIn && hasClaimedRequestId) {
    if (claimedRequest) return <ClaimedReview request={claimedRequest} activeDocument={activeDocument} setActiveDocument={setActiveDocument} message={message} setMessage={setMessage} deciding={deciding} error={inboxError} onDecide={approved => { void decide(approved); }} />;
    return (
      <ReviewFrame screen={inboxReady ? "referrer-review-unavailable" : "referrer-loading"} eyebrow="PRIVATE REVIEW" title="Private request" backHref="/inbox">
        <div className="mt-7 max-w-xl">
          {inboxReady
            ? <p role="alert" className={alertClass}>{inboxError || "This private request is not available to your verified employee account."}</p>
            : <LoadingSkeleton title="Loading your private company requests…" caption="Opening the role, note, and documents you claimed." />}
        </div>
      </ReviewFrame>
    );
  }

  const signedInStatus = isSignedIn && view === "overview" ? (
    <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-4">
      {!inboxReady ? <LoadingSkeleton title="Loading your private company requests…" caption="Checking requests waiting at your company." /> : null}
      {coverageRewardMessage ? <p role="status" className="rounded-[8px] border border-[var(--success)]/30 bg-[var(--success)]/10 p-3 text-sm font-medium text-[var(--success)]">{coverageRewardMessage}</p> : null}
      {showWorkEmailEnrollment ? (
        <section className="rounded-[8px] border border-border p-6">
          <h2 className="text-lg font-semibold">Use your company email account.</h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-[1.7] text-muted-foreground">Private Referrer access is a separate passwordless company-email sign-in. We never add that email to a personal account or send a code to another address.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => { void switchToWorkEmail(); }}>Continue with work email</Button>
        </section>
      ) : null}
      {workEmailError && !showWorkEmailEnrollment ? <p role="alert" className={alertClass}>{workEmailError}</p> : null}
      {inboxError ? <p role="alert" className={alertClass}>{inboxError}</p> : null}
      {inboxReady && !inboxError && !showWorkEmailEnrollment && inbox.length === 0 ? (
        <section data-skipwait-empty-preview="referrer" aria-label="No private requests at your company yet" className="grid gap-1 pt-2 sm:grid-cols-[auto_1fr] sm:gap-6">
          <span className="empty-icon !mb-4"><ClipboardCheck /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">No private requests at your company yet.</h2>
            <p className="mt-1.5 text-[13px] leading-[1.7] text-muted-foreground">New requests for your company appear in your request queue. Sharing SkipWait is always voluntary.</p>
            <ZeroActivityShareCard audience="referrer" />
          </div>
        </section>
      ) : null}
      {inbox.length ? (
        <section aria-label="Private requests at your company" className="min-w-0 pt-2">
          <h2 className="text-lg font-semibold">Private requests at your company.</h2>
          <p className="mt-1.5 text-[13px] leading-[1.7] text-muted-foreground">Reviewing and responding are always free. Your identity stays hidden until you choose to help.</p>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3">
            {inbox.map(request => (
              <article key={request.id} className="rounded-[7px] border border-border p-4">
                <p className="eyebrow">{request.companyDomain} · {request.attachmentCount} document{request.attachmentCount === 1 ? "" : "s"}</p>
                <a href={request.targetRoleUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-sm font-semibold">{request.targetRoleUrl}</a>
                <p className="mt-2 text-[13px] text-muted-foreground">Review the candidate’s note and resume before deciding whether you can help.</p>
                <Button type="button" variant="outline" className="mt-4" onClick={() => { void claim(request.id); }} disabled={claimingId === request.id}>{claimingId === request.id ? "Opening review…" : "Review candidate"}</Button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  ) : null;

  return (
    <ReferrerWorkspace view={view} screen={isSignedIn ? `referrer-${view}` : "referrer-sign-in"} onSetUp={setUp}>
      {view === "setup"
        ? <CapacitySettingsPanel isSignedIn={isSignedIn} getToken={getToken} onSignIn={() => setSignInOpen(true)} />
        : <ReferrerOverview onPreviewAsks={() => go("/queue")} />}
      {signedInStatus}
      {signInOpen && !isSignedIn && isLoaded !== false ? <ReferrerSignInDialog inviteCompany={inviteCompany || undefined} inviteCode={inviteCode || undefined} onClose={() => { setSignInOpen(false); setSignInDismissed(true); }} /> : null}
    </ReferrerWorkspace>
  );
}
