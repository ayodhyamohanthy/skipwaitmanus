import { ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type InboxItem = { id: number; companyDomain: string; status: string; savedAt: string | null; createdAt: string; updatedAt: string; isClaimedByYou: boolean; unreadMessageCount: number };
type Impact = { reviewed: number; approved: number; introductions: number; interviews: number; offers: number };
type Access = { verifiedCompanyAccess: boolean; workEmailDomain: string | null };
type ProfileShape = { workEmailVerifiedAt: string | null; referralCapacity: number | null };

const REVERIFY_DAYS = 90;
const REVERIFY_WARNING_DAYS = 14;

export default function ReferrerHome() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [access, setAccess] = useState<Access | null>(null);
  const [capacity, setCapacity] = useState(3);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [fresh, setFresh] = useState<InboxItem[]>([]);
  const [active, setActive] = useState<InboxItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let on = true;
    setLoading(true);
    void (async () => {
      try {
        const token = await fetchToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const get = async <T,>(path: string) => {
          const response = await fetch(path, { credentials: "include", headers });
          const payload = await readApiJson<T & { error?: string }>(response, "");
          return response.ok ? payload : undefined;
        };
        const [accessPayload, profilePayload, impactPayload, newPayload, donePayload, prefsPayload] = await Promise.all([
          get<{ verifiedCompanyAccess?: boolean; workEmailDomain?: string | null }>("/api/company-referrals/access"),
          get<{ profile?: ProfileShape | null }>("/api/profile/me"),
          get<{ summary?: Impact }>("/api/referrer-impact/me"),
          get<{ requests?: InboxItem[] }>("/api/company-referrals/inbox?scope=new"),
          get<{ requests?: InboxItem[] }>("/api/company-referrals/inbox?scope=completed"),
          get<{ preferences?: { paused?: boolean } }>("/api/referrer-preferences"),
        ]);
        if (!on) return;
        if (typeof prefsPayload?.preferences?.paused === "boolean") setPaused(prefsPayload.preferences.paused);
        if (accessPayload) setAccess({ verifiedCompanyAccess: Boolean(accessPayload.verifiedCompanyAccess), workEmailDomain: accessPayload.workEmailDomain ?? null });
        if (typeof profilePayload?.profile?.referralCapacity === "number") setCapacity(profilePayload.profile.referralCapacity);
        if (profilePayload?.profile?.workEmailVerifiedAt) setVerifiedAt(profilePayload.profile.workEmailVerifiedAt);
        if (impactPayload?.summary) setImpact(impactPayload.summary);
        setFresh(newPayload?.requests ?? []);
        setActive((donePayload?.requests ?? []).filter(item => item.isClaimedByYou && (item.status === "approved" || item.unreadMessageCount > 0)));
      } finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [fetchToken, isSignedIn]);

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-home-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Referrer home</p>
        <h1 className="mt-2 text-3xl font-semibold">Your daily referrer view.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">New asks, capacity, and your private record — after you verify a work email.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const verified = Boolean(access?.verifiedCompanyAccess);
  const setPausedValue = async (value: boolean) => {
    setResuming(true);
    try {
      const token = await fetchToken();
      const response = await fetch("/api/referrer-preferences", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ paused: value }) });
      if (response.ok) setPaused(value);
    } finally { setResuming(false); }
  };
  const resume = async () => { await setPausedValue(false); };
  const domain = access?.workEmailDomain ?? "";
  const verifiedDate = verifiedAt ? new Date(verifiedAt).getTime() : NaN;
  const daysSinceVerify = Number.isNaN(verifiedDate) ? NaN : Math.floor((Date.now() - verifiedDate) / 86400000);
  const reverifyDue = verified && !Number.isNaN(daysSinceVerify) && daysSinceVerify >= REVERIFY_DAYS - REVERIFY_WARNING_DAYS;
  const used = active.length;
  const left = Math.max(0, capacity - used);
  const atCapacity = verified && used >= capacity;
  const isNew = verified && fresh.length === 0 && (impact?.reviewed ?? 0) === 0;

  return (
    <main data-skipwait-screen="referrer-home" className="page-content">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Referrer home{domain ? ` · ${domain}` : ""}</span>
          <h1 className="mt-2 text-4xl font-semibold">Good work.</h1>
          <p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Here&apos;s what needs you today. Nothing here is urgent unless it says so.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {verified ? <span className="flex items-center gap-1 text-sm"><BadgeCheck className="size-4 text-[var(--primary)]" />Verified · {domain}</span> : <Link href="/verify" className="brand-button">Become a referrer</Link>}
          <Link href="/queue" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Queue &amp; settings</Link>
          {verified && !paused ? <button type="button" disabled={resuming} onClick={() => { void setPausedValue(true); }} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Pause new asks</button> : null}
        </div>
      </div>

      {reverifyDue ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--accent)] p-4" role="status">
          <span className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4" />Re-verify your {domain} email soon to keep receiving asks.</span>
          <Link href="/verify" className="brand-button">Re-verify</Link>
        </div>
      ) : null}
      {verified && paused ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4" role="status">
          <span className="text-sm font-semibold">New asks are paused. Open conversations still work.</span>
          <button type="button" disabled={resuming} onClick={() => { void resume(); }} className="brand-button">{resuming ? "Resuming…" : "Resume"}</button>
        </div>
      ) : null}

      {loading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading your referrer day…</p> : !verified ? (
        <section className="rounded-3xl border border-[var(--border)] p-8 text-center">
          <h2 className="text-xl font-semibold">Verify a work email to begin.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">A one-time code proves your company. Your identity stays hidden until you accept a request.</p>
          <Link href="/verify" className="brand-button mt-5">Verify work email <ArrowRight /></Link>
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-[var(--border)] p-5"><Inbox className="mb-2 size-5" /><strong className="text-3xl">{fresh.length}</strong><p className="text-sm text-[var(--muted-foreground)]">New asks waiting</p></div>
            <div className="rounded-3xl border border-[var(--border)] p-5"><CheckCircle2 className="mb-2 size-5" /><strong className="text-3xl">{active.length}</strong><p className="text-sm text-[var(--muted-foreground)]">In review with you</p></div>
            <div className="rounded-3xl border border-[var(--border)] p-5">
              <strong className="text-3xl">{left}<span className="text-lg text-[var(--muted-foreground)]">/{capacity}</span></strong>
              <p className="text-sm text-[var(--muted-foreground)]">Capacity left</p>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--muted)]" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={capacity} aria-label="Capacity used"><span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${capacity ? Math.min(100, (used / capacity) * 100) : 0}%` }} /></div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section>
              <div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-semibold">Waiting for you</h2><Link href="/queue" className="text-link text-sm">Full queue →</Link></div>
              {atCapacity ? (
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-5"><h3 className="font-semibold">You&apos;ve hit your capacity.</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">New asks go to other referrers while you finish what&apos;s open.</p></div>
              ) : fresh.length === 0 ? (
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
                  <Inbox className="mx-auto mb-2 size-8" />
                  <h3 className="font-semibold">{isNew ? "Your first ask will appear here." : "No asks right now."}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{isNew ? "Seekers can now find a verified referrer. Share your profile to help them find you." : "Enjoy the quiet."}</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {fresh.map(item => (
                    <li key={item.id}>
                      <Link href={`/conversation/${item.id}?from=inbox`} className="flex min-h-16 items-center gap-3 rounded-3xl border border-[var(--border)] p-4" aria-label={`Private ask · Ref-${1000 + item.id}`}>
                        <span className="company-mark">{(item.companyDomain.charAt(0) || "?").toUpperCase()}</span>
                        <span className="min-w-0 flex-1"><strong className="block text-sm">Private ask · Ref-{1000 + item.id}</strong><small className="text-[var(--muted-foreground)]">{item.companyDomain}</small></span>
                        <ArrowRight className="size-4 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <aside className="space-y-4">
              <div className="rounded-3xl border border-[var(--border)] p-5">
                <span className="eyebrow">Your record · Private</span>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {[["Reviewed", impact?.reviewed ?? 0], ["Accepted", impact?.approved ?? 0], ["Introductions", impact?.introductions ?? 0], ["Interviews", impact?.interviews ?? 0]].map(([label, value]) => (
                    <div key={label as string}><dt className="text-[var(--muted-foreground)]">{label as string}</dt><dd className="text-xl font-semibold">{value as number}</dd></div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">Never ranked. Never public.</p>
              </div>
              <div className="rounded-3xl border border-[var(--border)] p-5 text-sm">
                <span className="eyebrow">Invite a colleague</span>
                <p className="mt-2 text-[var(--muted-foreground)]">More verified colleagues means faster answers for seekers.</p>
                <Link href="/invite" className="text-link mt-2 text-sm">Invite someone inside →</Link>
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
