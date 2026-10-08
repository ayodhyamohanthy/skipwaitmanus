import { ArrowRight, BadgeCheck, Check, Link2, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type Profile = { headline: string | null; currentTitle: string | null; location: string | null; bio: string | null; skills: string | null; company: string | null; workEmailDomain: string | null; workEmailVerifiedAt: string | null; handle: string | null; profileVisibility: string };

export default function Profile() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ headline: "", currentTitle: "", location: "", bio: "", skills: "", handle: "", profileVisibility: "private" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/profile/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ displayName?: string; profile?: Profile | null; error?: string }>(response, "We could not load your profile");
      if (!response.ok) throw new Error(payload.error || "We could not load your profile");
      setDisplayName(payload.displayName ?? "");
      const current = payload.profile;
      setProfile(current ?? null);
      setForm({
        headline: current?.headline ?? "",
        currentTitle: current?.currentTitle ?? "",
        location: current?.location ?? "",
        bio: current?.bio ?? "",
        skills: current?.skills ?? "",
        handle: current?.handle ?? "",
        profileVisibility: current?.profileVisibility ?? "private",
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load your profile"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/profile/me", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ ...form, handle: form.handle.trim() === "" ? null : form.handle }) });
      const payload = await readApiJson<{ profile?: Profile | null; error?: string }>(response, "We could not save your profile");
      if (!response.ok) throw new Error(payload.error || "We could not save your profile");
      setProfile(payload.profile ?? null);
      setNotice("Profile saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not save your profile"); }
    finally { setSaving(false); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="profile-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">You control what opens</p>
        <h1 className="mt-2 text-3xl font-semibold">Profile &amp; privacy.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Share the minimum needed for a useful introduction.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const field = "mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base";
  return (
    <main data-skipwait-screen="profile" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><span className="eyebrow">You control what opens</span><h1 className="mt-2 text-4xl font-semibold">Profile &amp; privacy<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Share the minimum needed for a useful introduction.</p></div>
        <div className="flex flex-wrap gap-2">
          {form.handle ? <Link href={`/p/${form.handle}`} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">View public profile <ArrowRight /></Link> : null}
          <Link href="/verify" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Verify work email</Link>
          <Link href="/onboarding" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Setup guide</Link>
          <Link href="/settings" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Settings</Link>
        </div>
      </div>
      <div className="intent-switch profile-switch mb-6" role="navigation" aria-label="Profile type">
        <span className="brand-button selected" aria-current="page"><UserRound />Seeker profile</span>
        <Link href="/referrer-setup" className="brand-button"><ShieldCheck />Referrer profile</Link>
      </div>

      {loading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading your profile…</p> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-3xl border border-[var(--border)] p-5 sm:p-7">
            <label className="block text-sm font-semibold">Display name
              <input value={displayName} disabled aria-disabled="true" className={`${field} opacity-70`} />
              <small className="mt-1 block font-normal text-[var(--muted-foreground)]">From your sign-in account.</small>
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Headline<input value={form.headline} maxLength={180} onChange={event => setForm({ ...form, headline: event.target.value })} placeholder="Your role and strongest area" className={field} /></label>
              <label className="block text-sm font-semibold">Current title<input value={form.currentTitle} maxLength={160} onChange={event => setForm({ ...form, currentTitle: event.target.value })} placeholder="Product Designer" className={field} /></label>
            </div>
            <label className="mt-4 block text-sm font-semibold">Location<input value={form.location} maxLength={120} onChange={event => setForm({ ...form, location: event.target.value })} placeholder="Bengaluru, India" className={field} /></label>
            <label className="mt-4 block text-sm font-semibold">Bio<textarea value={form.bio} maxLength={2000} rows={4} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="What you do and what you're looking for." className="mt-2 min-h-28 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] p-4 text-base" /></label>
            <label className="mt-4 block text-sm font-semibold">Skills (comma separated)<input value={form.skills} maxLength={1000} onChange={event => setForm({ ...form, skills: event.target.value })} placeholder="Design systems, prototyping, research" className={field} /></label>
            <label className="mt-4 block text-sm font-semibold">Profile handle
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 text-sm text-[var(--muted-foreground)]">skipwait.me/p/</span>
                <input value={form.handle} maxLength={40} onChange={event => setForm({ ...form, handle: event.target.value })} placeholder="yourname" className="h-12 w-full min-w-0 rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
              </div>
              <small className="mt-1 block font-normal text-[var(--muted-foreground)]">3–40 lowercase letters, numbers, or dashes.</small>
            </label>
            {form.handle ? (
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(`https://skipwait.me/p/${form.handle.trim().toLowerCase()}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><Link2 className="size-4" />{copied ? "Copied" : "Copy profile link"}</button>
            ) : null}
            {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
            {notice ? <p role="status" className="mt-4 text-sm font-semibold text-[var(--primary)]">{notice}</p> : null}
            <button type="button" disabled={saving} onClick={() => { void save(); }} className="brand-button mt-6 w-full sm:w-auto">{saving ? "Saving…" : <><Check />Save profile</>}</button>
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-[var(--border)] p-5">
              <span className="eyebrow">Who can see this</span>
              <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Profile visibility">
                {([["public", "Public", "Anyone, and search engines"], ["link", "Link only", "People with the link"], ["private", "Private", "Only referrers you ask"]] as const).map(([value, label, hint]) => (
                  <button key={value} type="button" role="radio" aria-checked={form.profileVisibility === value} onClick={() => setForm({ ...form, profileVisibility: value })} className={`rounded-2xl border p-3 text-left ${form.profileVisibility === value ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                    <strong className="block text-sm">{label}</strong><small className="text-[var(--muted-foreground)]">{hint}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-[var(--muted)] p-5 text-sm">
              <span className="eyebrow">Work email</span>
              {profile?.workEmailVerifiedAt ? (
                <p className="mt-2 flex items-center gap-2 font-medium"><BadgeCheck className="size-4 text-[var(--primary)]" />Verified at {profile.workEmailDomain}</p>
              ) : (
                <p className="mt-2">No verified work email yet. <Link href="/verify" className="text-link">Verify</Link></p>
              )}
              <p className="mt-2 flex items-center gap-2 text-[var(--muted-foreground)]"><ShieldCheck className="size-4" />Your email is never shown to seekers.</p>
            </div>
            <div className="rounded-3xl border border-[var(--border)] p-5 text-sm">
              <span className="eyebrow">More controls</span>
              <div className="mt-2 grid gap-2">
                <Link href="/work" className="text-link"><UserRound className="size-4" />Manage work showcase</Link>
                <Link href="/onboarding" className="text-link">Setup guide</Link>
                <Link href="/settings" className="text-link">Settings</Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
