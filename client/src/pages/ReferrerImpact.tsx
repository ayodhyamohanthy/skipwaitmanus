import { lazy, Suspense } from "react";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { useEffect, useState, type ReactNode } from "react";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowRight, CheckCircle2, HeartHandshake, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/kit/button";
import { REFERRER_SIGN_IN_HREF, ReferrerWorkspace } from "@/components/referrer/ReferrerWorkspace";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { readApiJson } from "@/lib/apiResponse";

// D-055: recognition only. Referrers earn no credits, so this page shows no credit balance.
type ReferrerImpactSummary = { acceptedReferrals: number; introductions: number; activeConversations: number; outcomesShared: number; pendingRequests: number; declinedRequests: number; unreadMessages: number; recentAccepted: Array<{ id: number; companyDomain: string; acceptedAt: string }> };

function relativeDays(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Kit v4 impact-zero frame: door icon, eyebrow, heading, copy, then real content. */
function ImpactState({ icon: Icon, eyebrow, title, text, alert = false, busy = false, children }: { icon: LucideIcon; eyebrow: string; title: string; text?: string; alert?: boolean; busy?: boolean; children?: ReactNode }) {
  return (
    <section className="impact-zero" role={alert ? "alert" : busy ? "status" : undefined} aria-busy={busy || undefined}>
      <span className="impact-door"><Icon className={busy ? "animate-spin motion-reduce:animate-none" : undefined} /></span>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return <span><strong>{value}</strong>{label}</span>;
}

function KitReferrerImpact() {
  const [, go] = useLocation();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [summary, setSummary] = useState<ReferrerImpactSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // The server's verified-referrer verdict (shared predicate); a failed check is an error, never the gate.
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
  const frame = (screen: string, content: ReactNode) => <ReferrerWorkspace view="impact" screen={screen} isSignedIn={Boolean(isSignedIn)} isSetUp={Boolean(isSignedIn) && hasVerifiedWorkEmail} onSignIn={() => go(REFERRER_SIGN_IN_HREF)}>{content}</ReferrerWorkspace>;
  const loadingState = <LoadingNote>Loading your private impact…</LoadingNote>;

  if (!isLoaded) return frame("referrer-impact-loading", loadingState);

  if (!isSignedIn) return frame("referrer-impact-sign-in", <ImpactState icon={HeartHandshake} eyebrow="PRIVATE BY DEFAULT" title="Sign in with your work email to see your referral impact" text="Accepted referrals, pending decisions, and private messages — all in one private view.">
    <Button type="button" className="mt-8" onClick={() => go(REFERRER_SIGN_IN_HREF)}>Sign in with work email</Button>
  </ImpactState>);

  if (access.status === "checking") return frame("referrer-impact-loading", loadingState);

  if (access.status === "error") return frame("referrer-impact-access-error", <ImpactState icon={RefreshCw} eyebrow="SOMETHING WENT WRONG" title="We could not check your verification." text={access.error.message || "Check your connection and try again."} alert>
    <Button type="button" className="mt-8" disabled={access.retrying} onClick={access.retry}><RefreshCw />{access.retrying ? "Trying again…" : "Try again"}</Button>
  </ImpactState>);

  // D-057: a personal-login session confirms the work email in place, never through the code sign-in.
  // The step-up is goal-native: the goal impact page renders it in place.
  if (access.status === "code_required") return <Suspense fallback={null}><GoalReferrerImpact /></Suspense>;

  if (!hasVerifiedWorkEmail) return frame("referrer-impact-setup", <ImpactState icon={ShieldCheck} eyebrow="PRIVATE BY DEFAULT" title="Verify your work email" text="Confirm a company email with a one-time code to unlock your private referral impact.">
    <Button asChild className="mt-8"><Link href="/referrer?setup=work-email">Add work email <ArrowRight /></Link></Button>
  </ImpactState>);

  if (loading && !summary && !error) return frame("referrer-impact-loading", loadingState);

  if (error) return frame("referrer-impact-error", <ImpactState icon={RefreshCw} eyebrow="SOMETHING WENT WRONG" title="We could not load your referral impact." text={error} alert>
    <Button type="button" className="mt-8" onClick={() => { void loadSummary(); }}><RefreshCw />Try again</Button>
  </ImpactState>);

  if (!summary) return null;

  if (summary.acceptedReferrals === 0) return frame("referrer-impact", <ImpactState icon={HeartHandshake} eyebrow="YOUR IMPACT STARTS AT ZERO" title="No invented scoreboards." text="When real introductions happen, this space can reflect actions you control: thoughtful replies, introductions made, and people helped. It will never rank generosity.">
    <div aria-label="Your private impact"><Stat value={summary.introductions} label="introductions" /><Stat value={summary.activeConversations} label="active conversations" /><Stat value={summary.outcomesShared} label="outcomes shared" /></div>
    <Button asChild><Link href="/queue">See how a request looks <ArrowRight /></Link></Button>
  </ImpactState>);

  return frame("referrer-impact", <ImpactState icon={HeartHandshake} eyebrow="ONLY YOU CAN SEE THIS" title="Your private impact at a glance." text="Introductions you made, conversations still open, and outcomes the seekers shared — from the requests you covered. skipwait.me never pays referrers.">
    {/* .impact-zero>div only wraps below 768px; six metrics overflow the frame on desktop, so wrap here at every width. */}
    <div aria-label="Your private impact" className="flex-wrap justify-center"><Stat value={summary.introductions} label="introductions" /><Stat value={summary.activeConversations} label="active conversations" /><Stat value={summary.outcomesShared} label="outcomes shared" /><Stat value={summary.acceptedReferrals} label="referrals accepted" /><Stat value={summary.pendingRequests} label="pending decisions" /><Stat value={summary.unreadMessages} label="unread messages" /></div>
    {summary.recentAccepted.length ? (
      <section aria-label="Recent referrals" className="mb-8 w-full max-w-xl rounded-[8px] border border-border p-5 text-left">
        <span className="eyebrow">Recent referrals</span>
        <ul className="mt-4 grid gap-3">
          {summary.recentAccepted.map(item => (
            <li key={item.id} className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[7px] bg-muted text-[var(--success)]"><CheckCircle2 className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.companyDomain}</span><span className="block text-xs text-muted-foreground">Accepted {relativeDays(item.acceptedAt)}</span></span>
            </li>
          ))}
        </ul>
      </section>
    ) : null}
    <nav aria-label="Next steps" className="flex flex-wrap justify-center gap-3">
      <Button asChild><Link href="/inbox">Open my inbox <ArrowRight /></Link></Button>
      <Button asChild variant="outline"><Link href="/share">Share skipwait.me</Link></Button>
    </nav>
    <small className="mt-8 flex max-w-xl items-start gap-2 text-left text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Your identity stays hidden unless you accept a request. Job Seekers never see your work email.</small>
  </ImpactState>);
}

const GoalReferrerImpact = lazy(() => import("./goal/referrer/GoalReferrerImpact"));

export default function ReferrerImpact() {
  if (goalSurfaceOn("referrer")) {
    return (
      <Suspense fallback={null}>
        <GoalReferrerImpact />
      </Suspense>
    );
  }
  return <KitReferrerImpact />;
}
