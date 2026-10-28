// Goal /referrer/impact (D-048-p3-referrer; packet docs/plans/D-048-referrer.md).
// Goal-first rebuild of the kit impact page: private recognition only, never a
// scoreboard (D-055: no credits, no ranking). The server's verified-referrer
// verdict gates; a failed check is a retryable error, never the verify gate.
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { GoalButton, GoalErrorState, GoalSkeletonRows } from "@/components/goal";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { readApiJson } from "@/lib/apiResponse";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { GoalWorkspaceNav } from "./GoalReferrer";

type ReferrerImpactSummary = { acceptedReferrals: number; introductions: number; activeConversations: number; outcomesShared: number; pendingRequests: number; declinedRequests: number; unreadMessages: number; recentAccepted: Array<{ id: number; companyDomain: string; acceptedAt: string }> };

function relativeDays(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function Kicker({ children }: { children: string }) {
  return <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{children}</p>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <span className="rounded-[10px] border border-g-hairline px-4 py-3"><strong className="block text-[24px] font-semibold leading-none">{value}</strong><span className="mt-1 block text-g-meta text-g-ink-3">{label}</span></span>;
}

function Frame({ screen, children }: { screen: string; children: React.ReactNode }) {
  return (
    <main data-skipwait-screen={screen} className="page-content bg-g-canvas font-g-sans text-g-ink">
      <Kicker>REFERRER WORKSPACE</Kicker>
      <h1 className="mt-3 text-g-display text-g-ink">Open doors. On your terms.</h1>
      <div className="mt-5"><GoalWorkspaceNav /></div>
      <div className="mt-6 max-w-[640px]">{children}</div>
    </main>
  );
}

export default function GoalReferrerImpact() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [summary, setSummary] = useState<ReferrerImpactSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const access = useReferrerAccess();
  const hasVerifiedWorkEmail = access.status === "verified";
  const loadSummary = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/referrer/impact-summary", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<ReferrerImpactSummary & { error?: string }>(response, "We could not load your referral impact");
      if (!response.ok) throw new Error(payload.error || "We could not load your referral impact");
      setSummary({ acceptedReferrals: Math.max(0, Number(payload.acceptedReferrals) || 0), introductions: Math.max(0, Number(payload.introductions) || 0), activeConversations: Math.max(0, Number(payload.activeConversations) || 0), outcomesShared: Math.max(0, Number(payload.outcomesShared) || 0), pendingRequests: Math.max(0, Number(payload.pendingRequests) || 0), declinedRequests: Math.max(0, Number(payload.declinedRequests) || 0), unreadMessages: Math.max(0, Number(payload.unreadMessages) || 0), recentAccepted: Array.isArray(payload.recentAccepted) ? payload.recentAccepted.slice(0, 5) : [] });
    } catch (reason) { setSummary(null); setError(reason instanceof Error ? reason.message : "We could not load your referral impact"); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isSignedIn && hasVerifiedWorkEmail) void loadSummary(); }, [isSignedIn, hasVerifiedWorkEmail]);

  if (!isLoaded || (isSignedIn && access.status === "checking")) return <Frame screen="referrer-impact-loading"><GoalSkeletonRows density="company" count={3} /></Frame>;

  if (!isSignedIn) {
    return (
      <Frame screen="referrer-impact-sign-in">
        <div className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
          <Kicker>PRIVATE BY DEFAULT</Kicker>
          <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Sign in with your work email to see your referral impact.</h2>
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Accepted referrals, pending decisions, and private messages - all in one private view.</p>
          <div className="mt-5"><GoalButton variant="primary" asChild><Link href={referrerSignInHref("/referrer/impact")}>Sign in with work email<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton></div>
        </div>
      </Frame>
    );
  }

  if (access.status === "error") return <Frame screen="referrer-impact-access-error"><GoalErrorState title="We could not check your verification." body={access.error.message || "Check your connection and try again."} retry={{ label: access.retrying ? "Trying again…" : "Try again", onClick: access.retry }} /></Frame>;

  if (!hasVerifiedWorkEmail) {
    return (
      <Frame screen="referrer-impact-setup">
        <div className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
          <Kicker>PRIVATE BY DEFAULT</Kicker>
          <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Verify your work email.</h2>
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Confirm a company email with a one-time code to unlock your private referral impact.</p>
          <div className="mt-5"><GoalButton variant="primary" asChild><Link href={referrerSignInHref("/referrer/impact")}>Add work email<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton></div>
        </div>
      </Frame>
    );
  }

  if (loading && !summary && !error) return <Frame screen="referrer-impact-loading"><GoalSkeletonRows density="company" count={3} /></Frame>;
  if (error) return <Frame screen="referrer-impact-error"><GoalErrorState title="We could not load your referral impact." body={error} retry={{ label: "Try again", onClick: () => { void loadSummary(); } }} /></Frame>;
  if (!summary) return null;

  if (summary.acceptedReferrals === 0) {
    return (
      <Frame screen="referrer-impact">
        <div className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
          <Kicker>YOUR IMPACT STARTS AT ZERO</Kicker>
          <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">No invented scoreboards.</h2>
          <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">When real introductions happen, this space can reflect actions you control: thoughtful replies, introductions made, and people helped. It will never rank generosity.</p>
          <div aria-label="Your private impact" className="mt-4 grid grid-cols-3 gap-2 max-gdesk:grid-cols-1"><Stat value={summary.introductions} label="introductions" /><Stat value={summary.activeConversations} label="active conversations" /><Stat value={summary.outcomesShared} label="outcomes shared" /></div>
          <div className="mt-5"><GoalButton variant="primary" asChild><Link href="/queue">See how a request looks<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton></div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame screen="referrer-impact">
      <div className="rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
        <Kicker>ONLY YOU CAN SEE THIS</Kicker>
        <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Your private impact at a glance.</h2>
        <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Introductions you made, conversations still open, and outcomes the seekers shared - from the requests you covered. skipwait.me never pays referrers.</p>
        <div aria-label="Your private impact" className="mt-4 grid grid-cols-3 gap-2 max-gdesk:grid-cols-2">
          <Stat value={summary.introductions} label="introductions" /><Stat value={summary.activeConversations} label="active conversations" /><Stat value={summary.outcomesShared} label="outcomes shared" /><Stat value={summary.acceptedReferrals} label="referrals accepted" /><Stat value={summary.pendingRequests} label="pending decisions" /><Stat value={summary.unreadMessages} label="unread messages" />
        </div>
        {summary.recentAccepted.length ? (
          <section aria-label="Recent referrals" className="mt-4 rounded-[10px] border border-g-hairline p-4">
            <Kicker>RECENT REFERRALS</Kicker>
            <ul className="mt-3 grid gap-2">
              {summary.recentAccepted.map(item => (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-g-hairline text-g-ink"><Check className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-g-label text-g-ink">{item.companyDomain}</span><span className="block text-g-meta text-g-ink-3">Accepted {relativeDays(item.acceptedAt)}</span></span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <nav aria-label="Next steps" className="mt-5 flex flex-wrap gap-2">
          <GoalButton variant="primary" asChild><Link href="/inbox">Open my inbox<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton>
          <GoalButton variant="outline" asChild><Link href="/share">Share skipwait.me</Link></GoalButton>
        </nav>
        <p className="mt-5 flex items-start gap-2 text-g-meta leading-[1.5] text-g-ink-3"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Your identity stays hidden unless you accept a request. Job seekers never see your work email.</p>
      </div>
    </Frame>
  );
}
