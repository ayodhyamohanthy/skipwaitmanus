import { ArrowLeft, ArrowRight, Inbox, LockKeyhole } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/_core/auth";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/kit/button";
import { ReferrerCreditsCard } from "@/components/ReferrerCreditsCard";
import { ReferrerFastTrackCard } from "@/components/ReferrerFastTrackCard";
import { ActionErrorCard } from "@/components/ActionErrorCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { kitStatusFor } from "@/components/inbox/inboxThreads";
import { REFERRER_SIGN_IN_HREF, ReferrerWorkspace } from "@/components/referrer/ReferrerWorkspace";
import { QueueGuidance, QueuePanel, QueueRequestCard } from "@/components/referrer/QueueParts";
import { PassPrivatelyPanel } from "@/components/referrer/PassPrivatelyPanel";
import { CandidatePreviewCard, type CandidatePreview, type DeclineReason } from "@/components/referrer/CandidatePreviewCard";
import { getAskShelfLifeEndsAtMs, type ReferralStatus } from "@shared/referral";
import { parseJobFunction, type JobFunction } from "@shared/jobFunctions";
import type { PassReasonCode } from "@shared/passReasons";
import { readApiJson } from "@/lib/apiResponse";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { useSlowLoad } from "@/hooks/useSlowLoad";

type CompanyInboxItem = { id: number; targetRoleUrl: string | null; companyDomain: string; companyName?: string | null; companyInitials?: string | null; jobFunction?: JobFunction | null; compensation?: string | null; status: ReferralStatus; savedAt: string | null; createdAt: string; updatedAt: string; attachmentCount: number; isClaimedByYou: boolean; isQueueOpenAllocation?: boolean; unreadMessageCount: number; expiresAt?: string | null; decisionDueAt?: string | null; waitingForCoverage?: boolean | null; coverageVisibleAt?: string | null };
type InboxPayload = { requests?: CompanyInboxItem[] };
type PrivateImpactSummary = { reviewed: number; approved: number; introductions: number; interviews: number; offers: number };

/** Kit v4 request queue: routed new requests first, then any saved earlier. Decided requests live in /inbox and Impact. */
export default function MyCompanyInbox() {
  const [, go] = useLocation();
  const requestedId = Number(new URLSearchParams(useSearch()).get("request"));
  const { isSignedIn, getToken } = useAuth();
  // The server's verified-referrer verdict (shared predicate), never the sign-in account's emails.
  const access = useReferrerAccess();
  const verified = access.status === "verified";
  const [requests, setRequests] = useState<CompanyInboxItem[]>([]);
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  // Start in the loading state when signed in so the first paint is the skeleton,
  // not a flash of the empty "Ready to help?" panel before the queue arrives.
  const [loading, setLoading] = useState(Boolean(isSignedIn));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acceptedId, setAcceptedId] = useState<number | null>(null);
  const [impact, setImpact] = useState<PrivateImpactSummary | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [passingId, setPassingId] = useState<number | null>(null);
  const [openingCapacity, setOpeningCapacity] = useState(false);
  const [pendingDecline, setPendingDecline] = useState<DeclineReason | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { showSkeleton, isSlow } = useSlowLoad(loading);

  const companyFetch = async <T extends object>(path: string, init?: RequestInit): Promise<T & { error?: string }> => {
    const token = await getToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await readApiJson<T & { error?: string }>(response, "We could not complete that private company request");
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };
  const loadInbox = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setLoadFailed(false); setPassingId(null);
    try {
      // The impact summary only feeds the empty panel; a failure there never
      // blocks the queue, and its eager catch keeps a failed load from leaving
      // an unhandled rejection behind.
      const impactPromise = companyFetch<{ summary?: PrivateImpactSummary }>("/api/referrer-impact/me");
      void impactPromise.catch(() => undefined);
      const [fresh, saved] = await Promise.all([
        companyFetch<InboxPayload>("/api/company-referrals/inbox?scope=new"),
        companyFetch<InboxPayload>("/api/company-referrals/inbox?scope=saved"),
      ]);
      // The function is read leniently: an unknown value shows the company alone.
      const withFunction = (row: CompanyInboxItem): CompanyInboxItem => ({ ...row, jobFunction: parseJobFunction(row.jobFunction) });
      const freshRows = (fresh.requests || []).map(withFunction);
      const seen = new Set(freshRows.map(row => row.id));
      setRequests([...freshRows, ...(saved.requests || []).filter(row => !seen.has(row.id)).map(withFunction)]);
      try { const impactPayload = await impactPromise; setImpact(impactPayload.summary || null); } catch { setImpact(null); }
    } catch (reason) { setLoadFailed(true); setError(reason instanceof Error ? reason.message : "We could not load your private company inbox"); }
    finally { setLoading(false); }
  };
  const raceError = error.includes("Another employee accepted");
  // The queue loads once the server confirms the verification, so a retried check that
  // succeeds also brings the queue in, and an unverified account never requests it.
  useEffect(() => { if (verified) void loadInbox(); }, [isSignedIn, verified]);
  const reviewCandidate = async (requestId: number) => { setWorkingId(requestId); setError(""); try { const payload = await companyFetch<{ request?: CandidatePreview }>(`/api/company-referrals/${requestId}/preview`); setPreview(payload.request || null); setPendingDecline(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load this private candidate preview"); } finally { setWorkingId(null); } };
  // /referrer-home rows link here as /queue?request=:id and open that request directly.
  useEffect(() => { if (isSignedIn && verified && Number.isInteger(requestedId) && requestedId > 0) void reviewCandidate(requestedId); }, [isSignedIn, verified, requestedId]);
  const oneClickReview = async (requestId: number, decision: "approved" | "declined", declineReason?: DeclineReason, passReason?: PassReasonCode) => {
    setWorkingId(requestId); setError("");
    try {
      await companyFetch(`/api/company-referrals/${requestId}/one-click-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision === "approved" ? { decision, ethicsConfirmed: true } : { decision, declineReason, ...(passReason ? { passReason } : {}) }) });
      setPreview(null); setPendingDecline(null); setPassingId(null);
      setAcceptedId(decision === "approved" ? requestId : null);
      setNotice(decision === "approved" ? "Request accepted. You can now message the Job Seeker privately." : "Passed privately. The Job Seeker gets a short private note — never your name.");
      await loadInbox();
    } catch (reason) { const message = reason instanceof Error ? reason.message : "This private request can no longer be reviewed"; setError(message.includes("no longer available") ? "Accept failed — Another employee accepted this request a moment earlier. Nothing was charged to your credits." : message); }
    finally { setWorkingId(null); }
  };
  const openReferralCapacity = async () => { setOpeningCapacity(true); setError(""); setNotice(""); setAcceptedId(null); try { const payload = await companyFetch<{ availability?: { allocatedCount?: number } }>("/api/company-referrals/availability/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotCount: 1 }) }); const allocatedCount = payload.availability?.allocatedCount ?? 0; setNotice(allocatedCount ? `${allocatedCount} waiting request${allocatedCount === 1 ? " is" : "s are"} now available for your review.` : "No waiting requests at your company right now."); await loadInbox(); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not open referral capacity"); } finally { setOpeningCapacity(false); } };
  const frame = (screen: string, content: ReactNode) => <ReferrerWorkspace view="queue" screen={screen} isSignedIn={Boolean(isSignedIn)} onSignIn={() => go(REFERRER_SIGN_IN_HREF)}>{content}</ReferrerWorkspace>;

  if (!isSignedIn) return frame("company-inbox-sign-in", <section className="queue-layout"><QueuePanel icon={LockKeyhole} title="Give referrals with control." text="Use a company email to see only matching private requests. Your identity stays hidden."><Button type="button" className="mt-6" onClick={() => go(REFERRER_SIGN_IN_HREF)}>Use company email <ArrowRight /></Button></QueuePanel><QueueGuidance /></section>);
  if (access.status === "checking") return frame("company-inbox-checking", <section className="queue-layout" aria-busy="true"><QueuePanel icon={LockKeyhole} title="Checking your verification." text="One moment.">{null}</QueuePanel></section>);
  if (access.status === "error") return frame("company-inbox-access-error", <section className="queue-layout"><ActionErrorCard title="We couldn’t check your verification" detail={access.error.message || "Check your connection and try again."} reassurance="Nothing changed on your account. Try again in a moment." onRetry={access.retry} retrying={access.retrying} className="self-start" /><QueueGuidance /></section>);
  if (!verified) return frame("company-inbox-setup", <section className="queue-layout"><QueuePanel icon={LockKeyhole} title="Verify your work email." text="A one-time code confirms your company corridor. Your name and work email never appear to Job Seekers."><Button type="button" className="mt-6" onClick={() => go(REFERRER_SIGN_IN_HREF)}>Add work email <ArrowRight /></Button></QueuePanel><QueueGuidance /></section>);

  if (preview) return frame("company-candidate-preview", <section className="queue-layout">
    <div className="col-span-full"><Button type="button" variant="ghost" className="-ml-3" onClick={() => setPreview(null)}><ArrowLeft />Back</Button></div>
    <CandidatePreviewCard
      preview={preview}
      working={workingId === preview.id}
      error={error}
      raceError={raceError}
      pendingDecline={pendingDecline}
      onAccept={() => { void oneClickReview(preview.id, "approved"); }}
      onDecline={reason => setPendingDecline(reason)}
      onConfirmDecline={reason => { void oneClickReview(preview.id, "declined", reason); }}
      onCancelDecline={() => setPendingDecline(null)}
      onRetry={() => { setError(""); void (pendingDecline ? oneClickReview(preview.id, "declined", pendingDecline) : oneClickReview(preview.id, "approved")); }}
      onBackToQueue={() => { setError(""); setPreview(null); setPendingDecline(null); void loadInbox(); }}
    />
    <QueueGuidance />
  </section>);

  const nowMs = Date.now();
  const cardFooter = (request: CompanyInboxItem) => {
    if (request.status !== "pending") return <footer><Button type="button" onClick={() => go(`/conversation/${request.id}?from=inbox`)}>Open conversation <ArrowRight /></Button></footer>;
    if (passingId === request.id) return <PassPrivatelyPanel working={workingId === request.id} onConfirm={reason => { void oneClickReview(request.id, "declined", reason.legacy, reason.code); }} onCancel={() => setPassingId(null)} />;
    return <footer>
      <Button type="button" variant="ghost" disabled={workingId === request.id} onClick={() => setPassingId(request.id)}>Pass privately</Button>
      <Button type="button" disabled={workingId === request.id} onClick={() => { void reviewCandidate(request.id); }}>{workingId === request.id ? "Opening request…" : "Open request"}<ArrowRight /></Button>
    </footer>;
  };

  let body: ReactNode;
  if (showSkeleton) body = <LoadingSkeleton title="Loading your queue…" caption="Checking your company’s private requests." slow={isSlow} />;
  else if (error) body = <ActionErrorCard title={raceError ? "Accept failed" : loadFailed ? "We couldn’t load your queue" : "That didn’t go through"} detail={error.replace(/^Accept failed — /, "")} reassurance={raceError ? undefined : loadFailed ? "Nothing changed on your side. Your queue is intact." : "Nothing was recorded. Your queue is unchanged."} retryLabel={raceError ? "Refresh queue" : "Try again"} onRetry={() => { setError(""); void loadInbox(); }} retrying={loading} />;
  else if (requests.length) body = <div className="grid min-w-0 content-start gap-[22px]">
    {requests.map(request => {
      const unclaimed = request.status === "pending" && !request.isClaimedByYou;
      // D-061: the server sends the window-aware expiry (7 days from first visibility); the shared clock
      // is the fallback for a payload without one. Waiting asks never reach a referrer inbox.
      const expiryMs = unclaimed ? (request.expiresAt ? Date.parse(request.expiresAt) : getAskShelfLifeEndsAtMs({ createdAt: request.createdAt, waitingForCoverage: request.waitingForCoverage, coverageVisibleAt: request.coverageVisibleAt })) : null;
      const validExpiry = expiryMs !== null && !Number.isNaN(expiryMs) ? expiryMs : null;
      const expiryDays = validExpiry === null ? null : Math.floor((validExpiry - nowMs) / 86_400_000);
      const daysShown = validExpiry === null ? null : Math.ceil((validExpiry - nowMs) / 86_400_000);
      const expiryLabel = daysShown === null ? null : daysShown < 0 ? "Expired" : daysShown === 0 ? "Expires today" : daysShown === 1 ? "Expires tomorrow" : `Expires in ${daysShown} days`;
      // D-038-A: the server's 48-hour decision deadline for this viewer's own claim or allocation.
      // Neutral wording, no countdown: an ask goes back to colleagues, nothing is taken from them.
      const dueMs = request.decisionDueAt ? Date.parse(request.decisionDueAt) : Number.NaN;
      const dueHours = Number.isNaN(dueMs) ? null : Math.ceil((dueMs - nowMs) / 3_600_000);
      const decisionDue = dueHours === null ? null : dueHours <= 0 ? "Decision due now" : `Decide within ${dueHours} hour${dueHours === 1 ? "" : "s"}`;
      return <QueueRequestCard
        key={request.id}
        request={request}
        badge={kitStatusFor(request.status)}
        expiry={expiryLabel}
        expiryUrgent={expiryDays !== null && expiryDays <= 1}
        decisionDue={decisionDue}
        footer={cardFooter(request)}
      />;
    })}
  </div>;
  else body = <QueuePanel icon={Inbox} label="Open referral capacity" title="Ready to help?" text="Open one real referral slot. Only the next private request for your company is notified.">
    {impact ? <div aria-label="Your private impact" className="mt-5 flex flex-wrap gap-[35px]">{([["Reviewed", impact.reviewed], ["Approved", impact.approved], ["Interviews", impact.interviews]] as const).map(([label, value]) => <span key={label} className="grid text-[11px] text-muted-foreground"><strong className="text-[27px] text-foreground">{value}</strong>{label}</span>)}</div> : null}
    <ReferrerCreditsCard />
    <ReferrerFastTrackCard />
    <Button type="button" className="mt-6" onClick={() => { void openReferralCapacity(); }} disabled={openingCapacity}>{openingCapacity ? "Opening capacity…" : "Open referral capacity"}<ArrowRight /></Button>
  </QueuePanel>;

  return frame("company-inbox", <section className="queue-layout">
    {notice ? <div role="status" className="col-span-full rounded-[5px] bg-muted px-3 py-2.5 text-[13px] font-semibold"><p>{notice}</p>{acceptedId ? <p className="mt-1 text-xs font-normal text-muted-foreground">Tip: open the conversation to introduce yourself and share how you can help. <Button type="button" variant="outline" size="sm" className="ml-1 !min-h-0 !px-2 !py-1 !shadow-none" onClick={() => go(`/conversation/${acceptedId}?from=inbox`)}>Open conversation</Button></p> : null}</div> : null}
    {body}
    <QueueGuidance />
  </section>);
}
