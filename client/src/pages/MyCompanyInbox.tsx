import { LockKeyhole } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/_core/auth";
import { useLocation, useSearch } from "wouter";
import { GoalButton, GoalErrorState, GoalNum, GoalSkeletonRows } from "@/components/goal";
import { QueueAsk } from "@/components/queue/QueueAsk";
import { QueueList } from "@/components/queue/QueueList";
import { QueueShell } from "@/components/queue/QueueShell";
import { queueRow } from "@/components/queue/queueRow";
import { ReferrerCreditsCard } from "@/components/ReferrerCreditsCard";
import { ReferrerFastTrackCard } from "@/components/ReferrerFastTrackCard";
import { REFERRER_SIGN_IN_HREF } from "@/components/referrer/ReferrerWorkspace";
import type { CandidatePreview, DeclineReason } from "@/components/referrer/CandidatePreviewCard";
import { getAskShelfLifeEndsAtMs, type ReferralStatus } from "@shared/referral";
import { parseJobFunction, type JobFunction } from "@shared/jobFunctions";
import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { readApiJson } from "@/lib/apiResponse";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { useSlowLoad } from "@/hooks/useSlowLoad";

type CompanyInboxItem = { id: number; targetRoleUrl: string | null; companyDomain: string; companyName?: string | null; companyInitials?: string | null; jobFunction?: JobFunction | null; compensation?: string | null; status: ReferralStatus; savedAt: string | null; createdAt: string; updatedAt: string; attachmentCount: number; isClaimedByYou: boolean; isQueueOpenAllocation?: boolean; unreadMessageCount: number; expiresAt?: string | null; waitingForCoverage?: boolean | null; coverageVisibleAt?: string | null };
type InboxPayload = { requests?: CompanyInboxItem[] };
type PrivateImpactSummary = { reviewed: number; approved: number; introductions: number; interviews: number; offers: number };
type QueueItem = { row: CompanyInboxItem; expiresAt: string | null };

const PAGE_TITLE = "Referral queue";

/** A gate on the way to the queue: one sentence, one primary, never a second black control. */
function QueueGate({ title, text, action, onAction }: { title: string; text: string; action: string; onAction(): void }) {
  return (
    <div className="mx-auto grid max-w-[520px] gap-3 px-5 py-16 max-gdesk:px-4 max-gdesk:py-10">
      <LockKeyhole aria-hidden="true" className="size-6 text-g-ink-2" strokeWidth={1.75} />
      <h2 className="text-g-heading text-g-ink">{title}</h2>
      <p className="text-g-body text-g-ink-2" style={{ textWrap: "pretty" }}>{text}</p>
      <GoalButton variant="primary" className="mt-2 justify-self-start" onClick={onAction}>{action}</GoalButton>
    </div>
  );
}

/** The empty queue: the one real action, its private impact, and the two context cards that keep their live tokens until their own slice. */
function QueueEmptyPanel({ impact, opening, onOpen }: { impact: PrivateImpactSummary | null; opening: boolean; onOpen(): void }) {
  return (
    <div className="grid gap-3 border-b border-g-hairline px-5 py-6 max-gdesk:px-4">
      <h3 className="text-g-label text-g-ink">Ready to help?</h3>
      <p className="text-g-meta text-g-ink-2" style={{ textWrap: "pretty" }}>Open one real referral slot. Only the next private request for your company is notified.</p>
      {impact ? (
        <dl aria-label="Your private impact" className="mt-1 flex flex-wrap gap-8">
          {([["Reviewed", impact.reviewed], ["Approved", impact.approved], ["Interviews", impact.interviews]] as const).map(([label, value]) => (
            <div key={label} className="grid">
              <dd className="text-g-heading text-g-ink"><GoalNum>{value}</GoalNum></dd>
              <dt className="text-g-meta text-g-ink-3">{label}</dt>
            </div>
          ))}
        </dl>
      ) : null}
      <GoalButton variant="primary" className="mt-2 justify-self-start" busy={opening} busyLabel="Opening capacity…" onClick={onOpen}>Open referral capacity</GoalButton>
      <div className="mt-4 grid gap-4"><ReferrerCreditsCard /><ReferrerFastTrackCard /></div>
    </div>
  );
}

/** Referral queue on the goal triage desk (D-048 phase 3, packet D-048-phase-3-referral-queue.md). */
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
  // not a flash of the empty panel before the queue arrives.
  const [loading, setLoading] = useState(Boolean(isSignedIn));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acceptedId, setAcceptedId] = useState<number | null>(null);
  const [impact, setImpact] = useState<PrivateImpactSummary | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [openingCapacity, setOpeningCapacity] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(Number.isInteger(requestedId) && requestedId > 0 ? requestedId : null);
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
    setLoading(true); setError(""); setLoadFailed(false);
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
  const reviewCandidate = async (requestId: number) => {
    setWorkingId(requestId); setError("");
    try { const payload = await companyFetch<{ request?: CandidatePreview }>(`/api/company-referrals/${requestId}/preview`); setPreview(payload.request || null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load this private candidate preview"); }
    finally { setWorkingId(null); }
  };
  // A row opens the ask in place; ?request=<id> keeps /referrer-home's deep links working.
  useEffect(() => { if (verified && selectedId !== null) void reviewCandidate(selectedId); }, [verified, selectedId]);
  const oneClickReview = async (requestId: number, decision: "approved" | "declined", declineReason?: DeclineReason, passReason?: PassReasonCode) => {
    setWorkingId(requestId); setError("");
    try {
      await companyFetch(`/api/company-referrals/${requestId}/one-click-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision === "approved" ? { decision, ethicsConfirmed: true } : { decision, declineReason, ...(passReason ? { passReason } : {}) }) });
      setPreview(null); setSelectedId(null);
      setAcceptedId(decision === "approved" ? requestId : null);
      setNotice(decision === "approved" ? "Request accepted. You can now message the Job Seeker privately." : "Passed privately. The Job Seeker gets a short private note — never your name.");
      await loadInbox();
    } catch (reason) { const message = reason instanceof Error ? reason.message : "This private request can no longer be reviewed"; setError(message.includes("no longer available") ? "Accept failed — Another employee accepted this request a moment earlier. Nothing was charged to your credits." : message); }
    finally { setWorkingId(null); }
  };
  const openReferralCapacity = async () => {
    setOpeningCapacity(true); setError(""); setNotice(""); setAcceptedId(null);
    try {
      const payload = await companyFetch<{ availability?: { allocatedCount?: number } }>("/api/company-referrals/availability/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotCount: 1 }) });
      const allocatedCount = payload.availability?.allocatedCount ?? 0;
      setNotice(allocatedCount ? `${allocatedCount} waiting request${allocatedCount === 1 ? " is" : "s are"} now available for your review.` : "No waiting requests at your company right now.");
      await loadInbox();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not open referral capacity"); }
    finally { setOpeningCapacity(false); }
  };

  if (!isSignedIn) return <QueueShell verified={false} pageTitle={PAGE_TITLE}><QueueGate title="Give referrals with control." text="Use a company email to see only matching private requests. Your identity stays hidden." action="Use company email" onAction={() => go(REFERRER_SIGN_IN_HREF)} /></QueueShell>;
  if (access.status === "checking") return <QueueShell verified={false} pageTitle={PAGE_TITLE}><div aria-busy="true" className="grid gap-3 px-4 py-8"><p className="px-3 text-g-meta text-g-ink-3">Checking your verification.</p><GoalSkeletonRows density="queue" count={3} /></div></QueueShell>;
  if (access.status === "error") return <QueueShell verified={false} pageTitle={PAGE_TITLE}><GoalErrorState className="mt-6" title="We couldn’t check your verification" body={`${access.error.message || "We could not check your company-email access"} Nothing changed on your account. Try again in a moment.`} retry={{ label: access.retrying ? "Checking…" : "Try again", onClick: access.retry }} /></QueueShell>;
  if (!verified) return <QueueShell verified={false} pageTitle={PAGE_TITLE}><QueueGate title="Verify your work email." text="A one-time code confirms your company corridor. Your name and work email never appear to Job Seekers." action="Add work email" onAction={() => go(REFERRER_SIGN_IN_HREF)} /></QueueShell>;

  const nowMs = Date.now();
  const items: QueueItem[] = requests.map(row => ({
    row,
    // The server sends the window-aware expiry (D-061); the shared clock is the fallback for a payload without one.
    expiresAt: row.expiresAt ?? (() => { const at = getAskShelfLifeEndsAtMs({ createdAt: row.createdAt, waitingForCoverage: row.waitingForCoverage, coverageVisibleAt: row.coverageVisibleAt }); return at === null ? null : new Date(at).toISOString(); })(),
  }));
  const rows = items.map(item => queueRow({ ...item.row, expiresAt: item.expiresAt }, nowMs));
  const waitingCount = rows.filter(row => row.isPending).length;
  const selectedItem = selectedId === null ? null : items.find(item => item.row.id === selectedId) ?? null;
  const selectedRow = selectedId === null ? null : rows.find(row => row.id === selectedId) ?? null;
  const companyLabel = access.access.companyName?.trim() || access.access.domain;
  const selectedIndex = selectedRow ? rows.findIndex(row => row.id === selectedRow.id) : -1;
  const select = (id: number) => { setError(""); setNotice(""); setSelectedId(id); };
  const step = (delta: number) => { const next = rows[selectedIndex + delta]; if (next) select(next.id); };

  let listBody: ReactNode;
  if (showSkeleton) {
    listBody = (
      <div className="px-1 py-2">
        <GoalSkeletonRows density="queue" count={3} />
        {isSlow ? <p className="px-3 pt-3 text-g-meta text-g-ink-3">Still loading your company’s private requests…</p> : null}
      </div>
    );
  } else if (error && !selectedRow) {
    listBody = <GoalErrorState title={raceError ? "Accept failed" : loadFailed ? "We couldn’t load your queue" : "That didn’t go through"} body={raceError ? error.replace(/^Accept failed — /, "") : loadFailed ? "Nothing changed on your side. Your queue is intact." : error} retry={{ label: "Try again", onClick: () => { setError(""); void loadInbox(); } }} />;
  } else if (!rows.length) {
    listBody = <QueueEmptyPanel impact={impact} opening={openingCapacity} onOpen={() => { void openReferralCapacity(); }} />;
  }

  return (
    <QueueShell verified pageTitle={PAGE_TITLE}>
      {notice ? (
        <div role="status" className="border-b border-g-hairline px-5 py-3 text-g-label text-g-ink max-gdesk:px-4">
          <p>{notice}</p>
          {acceptedId ? <p className="mt-1 text-g-meta font-normal text-g-ink-2">Next: open the conversation to introduce yourself and share how you can help. <a className="underline decoration-g-control-edge underline-offset-[3px]" href={`/conversation/${acceptedId}?from=inbox`}>Open conversation</a></p> : null}
        </div>
      ) : null}
      <div className="gdesk:grid gdesk:min-h-[calc(100vh-var(--g-topbar-h))] gdesk:grid-cols-[360px_minmax(0,1fr)]">
        <div className={selectedRow ? "max-gdesk:hidden" : undefined}>
          <QueueList companyLabel={companyLabel} waitingCount={showSkeleton ? null : waitingCount} rows={rows} selectedId={selectedId} onSelect={select}>
            {listBody}
          </QueueList>
        </div>
        {selectedRow ? (
          <div className="min-w-0">
            {preview && preview.id === selectedRow.id ? (
              <QueueAsk
                row={selectedRow}
                ask={preview}
                receivedAt={selectedItem?.row.createdAt ?? ""}
                closesAt={selectedItem?.expiresAt ?? null}
                position={{ index: selectedIndex + 1, total: rows.length, onPrev: () => step(-1), onNext: () => step(1) }}
                onBack={() => { setSelectedId(null); setPreview(null); setError(""); }}
                working={workingId === selectedRow.id}
                error={workingId === selectedRow.id ? "" : error}
                onAccept={() => { void oneClickReview(selectedRow.id, "approved"); }}
                // D-052: the picked code plus the legacy reason the server routes and credits on.
                onPass={reason => { void oneClickReview(selectedRow.id, "declined", PASS_REASON_OPTIONS.find(option => option.code === reason)?.legacy, reason); }}
                passing={workingId === selectedRow.id}
              />
            ) : (
              <div className="px-4 py-6">
                {error ? <GoalErrorState title="We couldn’t open this ask" body={error} retry={{ label: "Try again", onClick: () => { setError(""); void reviewCandidate(selectedRow.id); } }} /> : <><GoalSkeletonRows density="ask" count={1} /><p className="mt-4 text-g-meta text-g-ink-3">Opening this ask…</p></>}
              </div>
            )}
          </div>
        ) : (
          <div className="max-gdesk:hidden grid place-items-center px-10 py-16 text-center">
            <p className="max-w-[360px] text-g-meta text-g-ink-3">Choose an ask to read it. Names and resumes stay hidden until you accept.</p>
          </div>
        )}
      </div>
    </QueueShell>
  );
}
