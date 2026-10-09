import { ArrowLeft, ArrowRight, Bookmark, CheckCircle2, Inbox, LockKeyhole } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, useUser } from "@/_core/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/kit/button";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";
import { ReferrerCreditsCard } from "@/components/ReferrerCreditsCard";
import { ReferrerFastTrackCard } from "@/components/ReferrerFastTrackCard";
import { ActionErrorCard } from "@/components/ActionErrorCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { ReferrerWorkspace, referrerSetUpHref } from "@/components/referrer/ReferrerWorkspace";
import { ReferralCoverageInviteBanner } from "@/components/referrer/CoverageInviteBanner";
import { QueueGuidance, QueuePanel, QueueRequestCard, ScopeTabs, type InboxScope } from "@/components/referrer/QueueParts";
import { CandidatePreviewCard, type CandidatePreview, type DeclineReason } from "@/components/referrer/CandidatePreviewCard";
import { askDaysLeft, formatAskExpiry, referralStatusLabels, type ReferralStatus } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";
import { useSlowLoad } from "@/hooks/useSlowLoad";

type CompanyInboxItem = { id: number; targetRoleUrl: string | null; companyDomain: string; compensation?: string | null; status: ReferralStatus; savedAt: string | null; createdAt: string; updatedAt: string; attachmentCount: number; isClaimedByYou: boolean; isQueueOpenAllocation?: boolean; unreadMessageCount: number };
type PrivateImpactSummary = { reviewed: number; approved: number; introductions: number; interviews: number; offers: number };
const personalEmailDomains = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com"]);

export default function MyCompanyInbox() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [scope, setScope] = useState<InboxScope>("new");
  const [requests, setRequests] = useState<CompanyInboxItem[]>([]);
  const [newRequestCount, setNewRequestCount] = useState(0);
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  // Start in the loading state when signed in so the first paint is the skeleton,
  // not a flash of the empty "Ready to help?" panel before the inbox arrives.
  const [loading, setLoading] = useState(Boolean(isSignedIn));
  const [error, setError] = useState("");
  const [capacityMessage, setCapacityMessage] = useState("");
  const [decidedRequestId, setDecidedRequestId] = useState<number | null>(null);
  const [impact, setImpact] = useState<PrivateImpactSummary | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [openingCapacity, setOpeningCapacity] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingDecline, setPendingDecline] = useState<DeclineReason | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { showSkeleton, isSlow } = useSlowLoad(loading);
  const hasVerifiedWorkEmail = Boolean(user?.emailAddresses.some(address => { const domain = address.emailAddress.trim().toLowerCase().split("@")[1]; return address.verification?.status === "verified" && domain && !personalEmailDomains.has(domain); }));

  const companyFetch = async <T extends object>(path: string, init?: RequestInit): Promise<T & { error?: string }> => {
    const token = await getToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await readApiJson<T & { error?: string }>(response, "We could not complete that private company request");
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };
  const loadInbox = async (nextScope = scope) => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setLoadFailed(false);
    try {
      // Kick off the secondary loads in parallel with the primary inbox fetch
      // so tab switches don't serialize three round-trips.
      const impactPromise = companyFetch<{ summary?: PrivateImpactSummary }>("/api/referrer-impact/me");
      const newCountPromise = nextScope === "new" ? null : companyFetch<{ requests?: CompanyInboxItem[] }>("/api/company-referrals/inbox?scope=new");
      // Eager no-op rejection handlers: if the primary fetch below throws,
      // these promises are never awaited, and their later rejection would be
      // an unhandled rejection (fails test runners, noise in browsers). The
      // awaited handling further down is unaffected.
      void impactPromise.catch(() => undefined);
      if (newCountPromise) void newCountPromise.catch(() => undefined);
      const payload = await companyFetch<{ requests?: CompanyInboxItem[] }>(`/api/company-referrals/inbox?scope=${nextScope}`);
      setRequests(payload.requests || []);
      try { const impactPayload = await impactPromise; setImpact(impactPayload.summary || null); } catch { setImpact(null); }
      if (nextScope === "new") setNewRequestCount((payload.requests || []).length);
      else if (newCountPromise) { try { const newPayload = await newCountPromise; setNewRequestCount((newPayload.requests || []).length); } catch { /* keep the previous count */ } }
      setActiveIndex(0);
    } catch (reason) { setLoadFailed(true); setError(reason instanceof Error ? reason.message : "We could not load your private company inbox"); }
    finally { setLoading(false); }
  };
  const raceError = error.includes("Another employee accepted");
  useEffect(() => { void loadInbox(scope); }, [isSignedIn, scope]);
  const save = async (requestId: number, saved: boolean) => { setWorkingId(requestId); setError(""); try { await companyFetch(`/api/company-referrals/${requestId}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved }) }); await loadInbox(scope); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not update this private request"); } finally { setWorkingId(null); } };
  const reviewCandidate = async (requestId: number) => { setWorkingId(requestId); setError(""); try { const payload = await companyFetch<{ request?: CandidatePreview }>(`/api/company-referrals/${requestId}/preview`); setPreview(payload.request || null); setPendingDecline(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load this private candidate preview"); } finally { setWorkingId(null); } };
  const oneClickReview = async (requestId: number, decision: "approved" | "declined", declineReason?: DeclineReason) => {
    setWorkingId(requestId); setError("");
    try {
      await companyFetch(`/api/company-referrals/${requestId}/one-click-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, declineReason }) });
      setPreview(null); setPendingDecline(null); setScope("completed"); setDecidedRequestId(decision === "approved" ? requestId : null); setCapacityMessage(decision === "approved" ? "Referral accepted. You can now message the Job Seeker privately." : "Decision recorded and shared privately with the Job Seeker."); await loadInbox("completed");
    } catch (reason) { const message = reason instanceof Error ? reason.message : "This private request can no longer be reviewed"; setError(message.includes("no longer available") ? "Accept failed — Another employee accepted this request a moment earlier. Nothing was charged to your credits." : message); }
    finally { setWorkingId(null); }
  };
  const openReferralCapacity = async () => { setOpeningCapacity(true); setError(""); setCapacityMessage(""); setDecidedRequestId(null); try { const payload = await companyFetch<{ availability?: { allocatedCount?: number } }>("/api/company-referrals/availability/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotCount: 1 }) }); const allocatedCount = payload.availability?.allocatedCount ?? 0; setCapacityMessage(allocatedCount ? `${allocatedCount} waiting request${allocatedCount === 1 ? " is" : "s are"} now available for your review.` : "No waiting requests at your company right now."); await loadInbox("new"); } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not open referral capacity"); } finally { setOpeningCapacity(false); } };
  const selectScope = (nextScope: InboxScope) => { setPreview(null); setScope(nextScope); setActiveIndex(0); };
  const frame = (screen: string, content: ReactNode) => <ReferrerWorkspace view="queue" screen={screen} onSetUp={() => go(referrerSetUpHref(Boolean(isSignedIn)))}>{content}</ReferrerWorkspace>;

  if (!isSignedIn) return frame("company-inbox-sign-in", <section className="queue-layout"><QueuePanel icon={LockKeyhole} title="Give referrals with control." text="Use a company email to see only matching private requests. Your identity stays hidden."><Button type="button" className="mt-6" onClick={() => go("/referrer?setup=work-email")}>Use company email <ArrowRight /></Button></QueuePanel><QueueGuidance /></section>);
  if (!hasVerifiedWorkEmail) return frame("company-inbox-setup", <section className="queue-layout"><QueuePanel icon={LockKeyhole} title="Verify your work email." text="A one-time code confirms your company corridor. Your name and work email never appear to Job Seekers."><Button type="button" className="mt-6" onClick={() => go("/referrer?setup=work-email")}>Add work email <ArrowRight /></Button></QueuePanel><QueueGuidance /></section>);

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
      onBackToQueue={() => { setError(""); setPreview(null); setPendingDecline(null); void loadInbox(scope); }}
    />
    <QueueGuidance />
  </section>);

  const request = requests[activeIndex];
  const requestExpiry = request && request.status === "pending" && !request.isClaimedByYou ? formatAskExpiry({ status: "pending", referrerId: null, createdAt: request.createdAt }, Date.now()) : null;
  const requestExpiryDays = request && request.status === "pending" && !request.isClaimedByYou ? askDaysLeft({ createdAt: request.createdAt }, Date.now()) : null;
  const requestExpiryUrgent = requestExpiryDays !== null && requestExpiryDays <= 1;
  const unreadConversationCount = scope === "completed" && request?.status === "approved" ? request.unreadMessageCount : 0;
  const detail = scope === "completed" ? request?.status === "approved" ? unreadConversationCount ? `The Job Seeker sent ${unreadConversationCount} new private message${unreadConversationCount === 1 ? "" : "s"}.` : "You accepted this referral request. You can now continue privately with the Job Seeker." : "Decision recorded for this private request." : request?.isQueueOpenAllocation ? "You opened capacity for this request. Review the candidate’s note, role link, and resume before deciding." : "Review the candidate’s note, role link, and resume before deciding whether to take this referral request.";
  const badge = scope === "completed" ? referralStatusLabels[request?.status ?? "pending"] : scope === "saved" ? "Saved privately" : request?.isQueueOpenAllocation ? "Ready to review" : "New private request";

  let body: ReactNode;
  if (showSkeleton) body = <LoadingSkeleton title="Loading your queue…" caption="Checking your company’s private requests." slow={isSlow} />;
  else if (error) body = <ActionErrorCard title={raceError ? "Accept failed" : loadFailed ? "We couldn’t load your queue" : "That didn’t go through"} detail={error.replace(/^Accept failed — /, "")} reassurance={raceError ? undefined : loadFailed ? "Nothing changed on your side. Your queue is intact." : "Nothing was recorded. Your queue is unchanged."} retryLabel={raceError ? "Refresh queue" : "Try again"} onRetry={() => { setError(""); void loadInbox(scope); }} retrying={loading} />;
  else if (request) {
    const actions = scope === "completed"
      ? request.status === "approved"
        ? <Button type="button" onClick={() => go(`/conversation/${request.id}?from=inbox`)}>{unreadConversationCount ? `Open conversation · ${unreadConversationCount} new` : "Message Job Seeker"} <ArrowRight /></Button>
        : <Button type="button" onClick={() => go("/post-opportunity")}>Share an opportunity <ArrowRight /></Button>
      : <>
          {scope === "new" ? <Button type="button" variant="ghost" onClick={() => { void save(request.id, true); }} disabled={workingId === request.id}><Bookmark />Save for later</Button> : <Button type="button" variant="ghost" onClick={() => { void save(request.id, false); }} disabled={workingId === request.id}>Return to New</Button>}
          <Button type="button" onClick={() => { void reviewCandidate(request.id); }} disabled={workingId === request.id}>{workingId === request.id ? "Opening request…" : "Open request"}<ArrowRight /></Button>
        </>;
    body = <div className="grid min-w-0 content-start gap-4">
      <QueueRequestCard request={request} badge={badge} expiry={requestExpiry} expiryUrgent={requestExpiryUrgent} detail={detail} actions={actions} />
      {scope === "completed" && request.status === "approved" ? <><ReferralCoverageInviteBanner companyDomain={request.companyDomain} /><Button type="button" variant="ghost" className="justify-self-start" onClick={() => go("/post-opportunity")}>Share an opportunity</Button></> : null}
    </div>;
  } else if (scope === "new") body = <QueuePanel icon={Inbox} label="Open referral capacity" title="Ready to help?" text="Open one real referral slot. Only the next private request for your company is notified.">
    {impact ? <div aria-label="Your private impact" className="mt-5 flex flex-wrap gap-[35px]">{([["Reviewed", impact.reviewed], ["Approved", impact.approved], ["Interviews", impact.interviews]] as const).map(([label, value]) => <span key={label} className="grid text-[11px] text-muted-foreground"><strong className="text-[27px] text-foreground">{value}</strong>{label}</span>)}</div> : null}
    <ReferrerCreditsCard />
    <ReferrerFastTrackCard />
    <Button type="button" className="mt-6" onClick={() => { void openReferralCapacity(); }} disabled={openingCapacity}>{openingCapacity ? "Opening capacity…" : "Open referral capacity"}<ArrowRight /></Button>
  </QueuePanel>;
  else body = <QueuePanel icon={scope === "completed" ? CheckCircle2 : Inbox} label="No private referral requests" title={scope === "completed" ? "No recorded decisions yet." : "Nothing saved yet."}><ZeroActivityShareCard audience="referrer" /></QueuePanel>;

  return frame("company-inbox", <section className="queue-layout">
    <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
      <ScopeTabs scope={scope} newCount={newRequestCount} onSelect={selectScope} />
      {requests.length > 1 && !showSkeleton && !error ? <div className="flex items-center gap-1" aria-label="Request navigation">
        <span className="eyebrow mr-2">{activeIndex + 1} of {requests.length}</span>
        <Button type="button" variant="ghost" size="sm" disabled={activeIndex === 0} onClick={() => setActiveIndex(current => Math.max(0, current - 1))}><ArrowLeft />Previous</Button>
        <Button type="button" variant="ghost" size="sm" disabled={activeIndex === requests.length - 1} onClick={() => setActiveIndex(current => Math.min(requests.length - 1, current + 1))}>Next<ArrowRight /></Button>
      </div> : null}
    </div>
    {capacityMessage ? <div role="status" className="col-span-full rounded-[5px] bg-muted px-3 py-2.5 text-[13px] font-semibold"><p>{capacityMessage}</p>{decidedRequestId ? <p className="mt-1 text-xs font-normal text-muted-foreground">Tip: open the conversation to introduce yourself and share how you can help. <Button type="button" variant="outline" size="sm" className="ml-1 !min-h-0 !px-2 !py-1 !shadow-none" onClick={() => go(`/conversation/${decidedRequestId}?from=inbox`)}>Open conversation</Button></p> : null}</div> : null}
    {body}
    <QueueGuidance />
  </section>);
}
