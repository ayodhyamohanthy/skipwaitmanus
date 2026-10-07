import { ArrowLeft, ArrowRight, BadgeCheck, Bell, Check, Gauge, Layers, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

const FUNCTIONS = ["Engineering", "Product", "Design", "Data", "Marketing", "Operations", "Sales", "Finance", "HR"];
const STEPS = ["Areas", "Capacity", "Visibility", "Notifications", "Ready"] as const;
type Visibility = "anon" | "named";

export default function ReferrerSetup() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [step, setStep] = useState(0);
  const [areas, setAreas] = useState<string[]>([]);
  const [capacity, setCapacity] = useState(3);
  const [visibility, setVisibility] = useState<Visibility>("anon");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const token = await fetchToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [accessResponse, prefsResponse] = await Promise.all([
          fetch("/api/company-referrals/access", { credentials: "include", headers }),
          fetch("/api/referrer-preferences", { credentials: "include", headers }),
        ]);
        if (!active) return;
        if (accessResponse.ok) {
          const access = await readApiJson<{ verifiedCompanyAccess?: boolean }>(accessResponse, "");
          setVerified(Boolean(access.verifiedCompanyAccess));
        } else setVerified(false);
        if (prefsResponse.ok) {
          const payload = await readApiJson<{ preferences?: { preferAreas?: string[]; referralCapacity?: number; referrerVisibility?: string; notifyNewAsk?: boolean } }>(prefsResponse, "");
          const prefs = payload.preferences;
          if (prefs) {
            if (Array.isArray(prefs.preferAreas)) setAreas(prefs.preferAreas.filter(area => FUNCTIONS.includes(area)));
            if (typeof prefs.referralCapacity === "number") setCapacity(prefs.referralCapacity);
            if (prefs.referrerVisibility === "named") setVisibility("named");
            if (typeof prefs.notifyNewAsk === "boolean") setNotifyEmail(prefs.notifyNewAsk);
          }
        }
      } catch { if (active) setVerified(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn]);

  const toggleArea = (area: string) => setAreas(current => current.includes(area) ? current.filter(item => item !== area) : [...current, area]);

  const save = async () => {
    setSaving(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/referrer-preferences", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ preferAreas: areas, referralCapacity: capacity, referrerVisibility: visibility, notifyNewAsk: notifyEmail }) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not save your setup");
      if (!response.ok) throw new Error(payload.error || "We could not save your setup");
      setStep(4);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not save your setup"); }
    finally { setSaving(false); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-setup-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Referrer setup</p>
        <h1 className="mt-2 text-3xl font-semibold">Set up referring.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Sign in, verify a work email, then choose what you can judge.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="referrer-setup" className="page-content mx-auto max-w-2xl">
      {verified === false ? (
        <section className="rounded-3xl border border-[var(--border)] p-8 text-center">
          <BadgeCheck className="mx-auto mb-3 size-8 text-[var(--primary)]" />
          <h1 className="text-2xl font-semibold">Verify first.</h1>
          <p className="mx-auto mt-2 max-w-md text-[var(--muted-foreground)]">Setup opens after a one-time code confirms your work email.</p>
          <Link href="/verify" className="brand-button mt-6">Verify work email <ArrowRight /></Link>
        </section>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm"><BadgeCheck className="size-4 text-[var(--primary)]" />Verified referrer setup</div>
          <ol className="mb-8 grid grid-cols-5 gap-1.5" aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <li key={label}><span className={`block h-1.5 rounded-full ${i <= step ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} /><span className="mt-1.5 hidden text-xs text-[var(--muted-foreground)] sm:block">{label}</span></li>
            ))}
          </ol>

          {step === 0 ? (
            <section>
              <Layers className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">Which roles can you judge?</h1><p className="mt-2 text-[var(--muted-foreground)]">Pick the areas you can assess. Stored for when role matching ships.</p>
              <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Job areas">
                {FUNCTIONS.map(area => {
                  const on = areas.includes(area);
                  return <button key={area} type="button" aria-pressed={on} onClick={() => toggleArea(area)} className={`min-h-11 rounded-full border px-4 text-sm ${on ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border-[var(--border)]"}`}>{area}</button>;
                })}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section>
              <Gauge className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">How many asks a month?</h1><p className="mt-2 text-[var(--muted-foreground)]">Be realistic — you can change or pause anytime.</p>
              <p className="mt-8 text-center text-6xl font-semibold" aria-live="polite">{capacity}</p>
              <p className="text-center text-sm text-[var(--muted-foreground)]">asks per month</p>
              <input type="range" min={1} max={15} value={capacity} onChange={event => setCapacity(Number(event.target.value))} className="mt-6 w-full" aria-label="Monthly capacity" />
              <p className="mt-4 rounded-xl bg-[var(--muted)] p-3 text-sm">Most new referrers start with 3. Paused or full referrers stop getting new review emails.</p>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <UserRound className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">How should seekers see you?</h1>
              <div className="mt-6 grid gap-3" role="radiogroup" aria-label="Visibility">
                {([["anon", "Anonymous (recommended)", "“Someone at your company”. Name shown after you accept."], ["named", "Named on company pages", "Your name appears where company referrers are listed."] ] as const).map(([value, title, hint]) => (
                  <button key={value} type="button" role="radio" aria-checked={visibility === value} onClick={() => setVisibility(value)} className={`rounded-2xl border p-4 text-left ${visibility === value ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                    <strong className="block">{title}</strong><small className="text-[var(--muted-foreground)]">{hint}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <Bell className="mb-3 text-[var(--primary)]" /><h1 className="text-3xl font-semibold">When should we tell you?</h1>
              <button type="button" aria-pressed={notifyEmail} onClick={() => setNotifyEmail(!notifyEmail)} className={`mt-6 flex min-h-14 w-full items-center justify-between rounded-2xl border p-4 text-left ${notifyEmail ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                <span><strong className="block text-sm">Email when a new ask arrives</strong><small className="text-[var(--muted-foreground)]">Off means no review emails while you stay verified.</small></span>
                <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full ${notifyEmail ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)]"}`}>{notifyEmail ? <Check className="size-4" /> : null}</span>
              </button>
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">Safety and account notices are always sent.</p>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="text-center">
              <Check className="mx-auto size-12 text-[var(--primary)]" />
              <h1 className="mt-4 text-3xl font-semibold">You&apos;re open for asks.</h1>
              <p className="mt-2 text-[var(--muted-foreground)]">{areas.join(", ") || "No areas yet"} · {capacity}/month · {visibility === "anon" ? "anonymous" : "named"}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/profile" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Edit profile</Link>
                <Link href="/referrer-home" className="brand-button">Go to referrer home <ArrowRight /></Link>
              </div>
            </section>
          ) : null}

          {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
          {step < 4 ? (
            <footer className="mt-10 flex justify-between gap-3">
              {step > 0 ? <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => setStep(step - 1)}><ArrowLeft />Back</button> : <span />}
              {step === 3
                ? <button type="button" disabled={saving} onClick={() => { void save(); }} className="brand-button">{saving ? "Saving…" : <>Finish <ArrowRight /></>}</button>
                : <button type="button" disabled={step === 0 && areas.length === 0} onClick={() => setStep(step + 1)} className="brand-button">Continue <ArrowRight /></button>}
            </footer>
          ) : null}
        </>
      )}
    </main>
  );
}
