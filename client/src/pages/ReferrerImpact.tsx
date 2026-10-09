import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowRight, CheckCircle2, HeartHandshake, LoaderCircle, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/kit/button";
import { ReferrerWorkspace, referrerSetUpHref } from "@/components/referrer/ReferrerWorkspace";
import { readApiJson } from "@/lib/apiResponse";

type ReferrerImpactSummary = { acceptedReferrals: number; pendingRequests: number; declinedRequests: number; unreadMessages: number; creditsRemaining: number; recentAccepted: Array<{ id: number; companyDomain: string; acceptedAt: string }> };
type CompanyAccess = { verifiedCompanyAccess: boolean; workEmailDomain: string | null; error?: string };

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

export default function ReferrerImpact() {
  const [, go] = useLocation();
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const [summary, setSummary] = useState<ReferrerImpactSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [companyAccess, setCompanyAccess] = useState<CompanyAccess | null>(null);
  const [accessReady, setAccessReady] = useState(!isSignedIn);
  const hasVerifiedWorkEmail = Boolean(companyAccess?.verifiedCompanyAccess && companyAccess.workEmailDomain);
  const loadCompanyAccess = async () => { if (!isSignedIn) { setCompanyAccess(null); setAccessReady(true); return; } try { const token = await getToken(); const response = await fetch("/api/company-referrals/access", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }); const payload = await readApiJson<CompanyAccess>(response, "We could not check your work-email access"); setCompanyAccess({ verifiedCompanyAccess: Boolean(payload.verifiedCompanyAccess), workEmailDomain: payload.workEmailDomain ?? null }); } catch { setCompanyAccess(null); } finally { setAccessReady(true); } };
  const loadSummary = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/referrer/impact-summary", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<ReferrerImpactSummary & { error?: string }>(response, "We could not load your referral impact");
      if (!response.ok) throw new Error(payload.error || "We could not load your referral impact");
      setSummary({ acceptedReferrals: Math.max(0, Number(payload.acceptedReferrals) || 0), pendingRequests: Math.max(0, Number(payload.pendingRequests) || 0), declinedRequests: Math.max(0, Number(payload.declinedRequests) || 0), unreadMessages: Math.max(0, Number(payload.unreadMessages) || 0), creditsRemaining: Math.max(0, Number(payload.creditsRemaining) || 0), recentAccepted: Array.isArray(payload.recentAccepted) ? payload.recentAccepted.slice(0, 5) : [] });
    } catch (reason) { setSummary(null); setError(reason instanceof Error ? reason.message : "We could not load your referral impact"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadCompanyAccess(); }, [isSignedIn]);
  useEffect(() => { if (isSignedIn && hasVerifiedWorkEmail) void loadSummary(); }, [isSignedIn, hasVerifiedWorkEmail]);
  const frame = (screen: string, content: ReactNode) => <ReferrerWorkspace view="impact" screen={screen} onSetUp={() => go(referrerSetUpHref(Boolean(isSignedIn)))}>{content}</ReferrerWorkspace>;
  const loadingState = <ImpactState icon={LoaderCircle} eyebrow="PRIVATE BY DEFAULT" title="Loading your private impact…" busy />;

  if (!isLoaded) return frame("referrer-impact-loading", loadingState);

  if (!isSignedIn) return frame("referrer-impact-sign-in", <ImpactState icon={HeartHandshake} eyebrow="PRIVATE BY DEFAULT" title="Sign in with your work email to see your referral impact" text="Accepted referrals, pending decisions, and private messages — all in one private view.">
    {/* The kit Button is not a bare <button>, so it calls openSignIn itself instead of nesting inside SignInButton. */}
    <Button type="button" className="mt-8" onClick={() => openSignIn?.()}>Secure sign in</Button>
  </ImpactState>);

  if (!accessReady) return frame("referrer-impact-loading", loadingState);

  if (!hasVerifiedWorkEmail) return frame("referrer-impact-setup", <ImpactState icon={ShieldCheck} eyebrow="PRIVATE BY DEFAULT" title="Verify your work email" text="Confirm a company email with a one-time code to unlock your private referral impact.">
    <Button asChild className="mt-8"><Link href="/referrer?setup=work-email">Add work email <ArrowRight /></Link></Button>
  </ImpactState>);

  if (loading && !summary && !error) return frame("referrer-impact-loading", loadingState);

  if (error) return frame("referrer-impact-error", <ImpactState icon={RefreshCw} eyebrow="SOMETHING WENT WRONG" title="We could not load your referral impact." text={error} alert>
    <Button type="button" className="mt-8" onClick={() => { void loadSummary(); }}><RefreshCw />Try again</Button>
  </ImpactState>);

  if (!summary) return null;

  if (summary.acceptedReferrals === 0) return frame("referrer-impact", <ImpactState icon={HeartHandshake} eyebrow="YOUR IMPACT STARTS AT ZERO" title="No invented scoreboards." text="When real introductions happen, this space can reflect actions you control: thoughtful replies, introductions made, and people helped. It will never rank generosity.">
    <div aria-label="Your private impact"><Stat value={summary.acceptedReferrals} label="referrals accepted" /><Stat value={summary.pendingRequests} label="pending decisions" /><Stat value={summary.unreadMessages} label="unread messages" /></div>
    <Button asChild><Link href="/queue">Open request queue <ArrowRight /></Link></Button>
  </ImpactState>);

  return frame("referrer-impact", <ImpactState icon={HeartHandshake} eyebrow="ONLY YOU CAN SEE THIS" title="Your private impact at a glance." text="Acceptances, pending decisions, and private messages from the requests you covered.">
    <div aria-label="Your private impact"><Stat value={summary.acceptedReferrals} label="referrals accepted" /><Stat value={summary.pendingRequests} label="pending decisions" /><Stat value={summary.unreadMessages} label="unread messages" /><Stat value={summary.creditsRemaining} label="credits remaining" /></div>
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
