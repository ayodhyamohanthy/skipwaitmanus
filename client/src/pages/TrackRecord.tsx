import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";
import { ArrowLeft, ArrowRight, Award, FileText, RefreshCw, ShieldCheck, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import type { JobSeekerReliability, ReferrerReputation } from "@shared/reputation";

/**
 * Self-view track record.
 *
 * Contract with the server (see server/reputationRoutes.ts and
 * shared/reputation.ts): both endpoints are self-view only, and every rate is
 * `null` until its denominator exists. This page must never turn a `null` into
 * `0` — an unproven record is rendered as unproven, not as a bad score.
 */

type ReferrerState =
  | { status: "checking" }
  | { status: "ready"; reputation: ReferrerReputation }
  | { status: "needs_work_email" }
  | { status: "error"; message: string };

const UNPROVEN = "—";

/** A null rate means "no history yet", which is not the same as 0%. */
function formatRate(value: number | null) {
  return value === null ? UNPROVEN : `${Math.round(value * 100)}%`;
}

function formatHours(value: number | null) {
  if (value === null) return UNPROVEN;
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} min`;
  if (value < 48) return `${Number.isInteger(value) ? value : value.toFixed(1)} h`;
  return `${Math.round(value / 24)} d`;
}

function Stat({ label, value, detail, tone = "neutral" }: { label: string; value: string | number; detail: string; tone?: "neutral" | "good" | "warn" }) {
  const valueClass = tone === "good" ? "text-[#15803d]" : tone === "warn" ? "text-[#B45309]" : "text-black";
  return <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#505050]">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-[-.04em] ${valueClass}`}>{value}</p><p className="mt-1.5 text-xs leading-5 text-[#505050]">{detail}</p></div>;
}

function Shell({ screen, children }: { screen: string; children: ReactNode }) {
  return <main data-skipwait-screen={screen} className="min-h-dvh bg-white px-5 py-4 text-black"><div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><Brand /><AccountMenu /></header>{children}</div></main>;
}

function LoadingShell({ screen }: { screen: string }) {
  return <Shell screen={screen}><section className="flex min-h-0 flex-1 items-center"><div className="w-full animate-pulse rounded-2xl border border-[#e5e5e5] bg-white p-6"><div className="h-3 w-28 rounded bg-[#e0e0ff]" /><div className="mt-5 h-8 w-3/4 rounded bg-[#f0f0f0]" /><div className="mt-3 h-4 w-full rounded bg-[#f0f0f0]" /><div className="mt-6 grid grid-cols-2 gap-3"><div className="h-24 rounded-xl bg-[#f0f0f0]" /><div className="h-24 rounded-xl bg-[#f0f0f0]" /></div></div></section></Shell>;
}

export default function TrackRecord() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [reliability, setReliability] = useState<JobSeekerReliability | null>(null);
  const [referrer, setReferrer] = useState<ReferrerState>({ status: "checking" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setReferrer({ status: "checking" });
    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const seekerResponse = await fetch("/api/reputation/seeker/me", { credentials: "include", headers });
      const seekerPayload = await readApiJson<{ reliability?: JobSeekerReliability; error?: string }>(seekerResponse, "We could not load your track record");
      if (!seekerResponse.ok || !seekerPayload.reliability) throw new Error(seekerPayload.error || "We could not load your track record");
      setReliability(seekerPayload.reliability);

      // The referrer record requires a verified work email. A 403 is an
      // expected setup state, not a failure of this page.
      try {
        const referrerResponse = await fetch("/api/reputation/referrer/me", { credentials: "include", headers });
        if (referrerResponse.status === 403) {
          setReferrer({ status: "needs_work_email" });
        } else {
          const referrerPayload = await readApiJson<{ reputation?: ReferrerReputation; error?: string }>(referrerResponse, "We could not load your referral track record");
          if (!referrerResponse.ok || !referrerPayload.reputation) throw new Error(referrerPayload.error || "We could not load your referral track record");
          setReferrer({ status: "ready", reputation: referrerPayload.reputation });
        }
      } catch (reason) {
        setReferrer({ status: "error", message: reason instanceof Error ? reason.message : "We could not load your referral track record" });
      }
    } catch (reason) {
      setReliability(null);
      setError(reason instanceof Error ? reason.message : "We could not load your track record");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [isSignedIn]);

  if (!isLoaded) return <LoadingShell screen="track-record-loading" />;

  if (!isSignedIn) return <Shell screen="track-record-sign-in"><section className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"><span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-3xl bg-[#ededff] text-black"><Award className="h-6 w-6" /></span><h1 className="font-display mt-3 text-[1.85rem] font-semibold leading-[1.04] tracking-[-.02em]">See your referral track record</h1><p className="mt-3 text-sm leading-6 text-[#505050]">Your own history only — how many requests you reviewed, what you decided, and how far they went. Never a public score.</p><SignInButton><button type="button" className="mt-6 rounded-lg bg-[#0000ff] px-5 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></Shell>;

  if (loading && !reliability && !error) return <LoadingShell screen="track-record-loading" />;

  if (error) return <Shell screen="track-record-error"><section className="flex min-h-0 flex-1 flex-col justify-center"><div role="alert" className="rounded-2xl border border-[#b91c1c]/30 bg-white p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#B91C1C]">Something went wrong</p><h1 className="font-display mt-2 text-2xl font-semibold tracking-[-.03em]">We could not load your track record.</h1><p className="mt-3 text-sm leading-6 text-[#505050]">{error}</p><button type="button" onClick={() => { void load(); }} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />Try again</button></div></section></Shell>;

  if (!reliability) return null;

  const referrerReputation = referrer.status === "ready" ? referrer.reputation : null;
  const hasReferrerHistory = Boolean(referrerReputation && referrerReputation.decisions > 0);
  const hasSeekerHistory = reliability.totalRequests > 0;
  const nothingRecorded = !hasReferrerHistory && !hasSeekerHistory && referrer.status !== "error";

  return <Shell screen="track-record"><Link href="/" className="mt-5 inline-flex w-fit items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link><section className="flex-1 pb-8 pt-5"><h1 className="font-display mt-3 text-3xl font-semibold tracking-[-.04em]">Your track record.</h1><p className="mt-3 text-sm leading-6 text-[#505050]">Private to you. Every number below is derived from real requests and real decisions — nothing is estimated, and an unproven record stays blank.</p>

    {nothingRecorded ? <div className="mt-6 rounded-2xl border border-dashed border-[#0000ff] bg-white p-6 text-center"><span aria-hidden="true" className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#ededff] text-black"><Sparkles className="h-5 w-5" /></span><p className="mt-4 text-sm font-semibold text-black">Your record starts with your first real decision</p><p className="mt-2 text-sm leading-6 text-[#505050]">Send a request, or review one at your company, and this page fills in from what actually happened.</p><Link href="/start" className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3 text-sm font-semibold text-white">Start a referral request <ArrowRight className="h-4 w-4" /></Link></div> : null}

    <div className="mt-8">
      <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#0000ff]" /><h2 className="font-display text-xl font-semibold tracking-[-.03em]">As a Referrer</h2></div>
      <p className="mt-2 text-sm leading-6 text-[#505050]">What you did with the requests that reached your company.</p>

      {referrer.status === "checking" ? <div className="mt-4 h-40 animate-pulse rounded-2xl border border-[#e5e5e5] bg-white" /> : referrer.status === "needs_work_email" ? <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white p-5"><span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-[#ededff] text-black"><ShieldCheck className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-black">Verify your work email to unlock this half</p><p className="mt-2 text-sm leading-6 text-[#505050]">Referrer history only exists for a verified employee, so this section stays closed until your company email is confirmed.</p><Link href="/referrer?setup=work-email" className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-4 py-2.5 text-sm font-semibold text-white">Verify work email <ArrowRight className="h-4 w-4" /></Link></div> : referrer.status === "error" ? <div role="alert" className="mt-4 rounded-2xl border border-[#b45309]/30 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#B45309]">Unavailable</p><p className="mt-2 text-sm leading-6 text-[#505050]">{referrer.message}</p></div> : hasReferrerHistory ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><Stat label="Decisions" value={referrerReputation!.decisions} detail="Requests you accepted or declined" /><Stat label="Accepted" value={referrerReputation!.approvals} detail="Introductions you chose to make" tone="good" /><Stat label="Declined" value={referrerReputation!.declines} detail="Requests you passed on" /><Stat label="Approval rate" value={formatRate(referrerReputation!.approvalRate)} detail={referrerReputation!.approvalRate === null ? "No decisions recorded yet" : "Accepted share of your decisions"} /><Stat label="Introductions" value={referrerReputation!.introductions} detail="Accepted requests you actually submitted" /><Stat label="Interviews" value={referrerReputation!.interviews} detail="Of your introductions that reached an interview" /><Stat label="Offers" value={referrerReputation!.offers} detail="Of your introductions that reached an offer" tone="good" /><Stat label="Interview rate" value={formatRate(referrerReputation!.interviewHitRate)} detail={referrerReputation!.interviewHitRate === null ? "Needs one accepted request" : "Interviews per accepted request"} /><Stat label="Offer rate" value={formatRate(referrerReputation!.offerRate)} detail={referrerReputation!.offerRate === null ? "Needs one accepted request" : "Offers per accepted request"} /><Stat label="Median response" value={formatHours(referrerReputation!.medianResponseHours)} detail={referrerReputation!.medianResponseHours === null ? "No decision timing yet" : "Time from request to your decision"} /></div> : <div className="mt-4 rounded-2xl border border-dashed border-[#e5e5e5] bg-white p-5 text-center"><p className="text-sm font-semibold text-black">No referrer decisions yet</p><p className="mt-2 text-sm leading-6 text-[#505050]">Once you accept or decline a private request at your company, your record appears here.</p><Link href="/inbox" className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-semibold text-black">Open my company inbox</Link></div>}
    </div>

    <div className="mt-8">
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-[#0000ff]" /><h2 className="font-display text-xl font-semibold tracking-[-.03em]">As a Job Seeker</h2></div>
      <p className="mt-2 text-sm leading-6 text-[#505050]">How your own requests progressed. Withdrawing before a claim is normal and never counts against you.</p>
      {hasSeekerHistory ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><Stat label="Requests sent" value={reliability.totalRequests} detail="Private requests you created" /><Stat label="Reviews received" value={reliability.reviewsReceived} detail="Requests a verified employee decided on" /><Stat label="Approved" value={reliability.approvalsReceived} detail="Requests an employee chose to take forward" tone="good" /><Stat label="Withdrawn" value={reliability.withdrawnBeforeClaim} detail="Pulled back before anyone claimed them" /><Stat label="Introductions" value={reliability.introductions} detail="Referrals actually submitted for you" /><Stat label="Interviews" value={reliability.interviews} detail="Of your referrals that reached an interview" /><Stat label="Offers" value={reliability.offers} detail="Of your referrals that reached an offer" tone="good" /><Stat label="Completion rate" value={formatRate(reliability.completionRate)} detail={reliability.completionRate === null ? "Needs one approved request" : "Approved requests that became introductions"} /></div> : <div className="mt-4 rounded-2xl border border-dashed border-[#e5e5e5] bg-white p-5 text-center"><span aria-hidden="true" className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#ededff] text-black"><FileText className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-black">No requests yet</p><p className="mt-2 text-sm leading-6 text-[#505050]">Your first private request starts this record.</p><Link href="/start" className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-4 py-2.5 text-sm font-semibold text-white">Start a request <ArrowRight className="h-4 w-4" /></Link></div>}
    </div>

    <p className="mt-8 flex items-start gap-2 text-xs leading-5 text-[#505050]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#15803d]" />Only you can see this page. There are no public rankings, no scores shared with employers, and no candidate identities anywhere in these numbers.</p>
    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#505050]"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[#0000ff]" />Counts come from a durable event log, so a request closing later never erases a milestone you already reached.</p>
  </section></Shell>;
}
