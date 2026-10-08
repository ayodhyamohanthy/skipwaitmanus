import { ArrowLeft, ArrowRight, Building2, Check } from "lucide-react";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { LAUNCH_COMPANIES } from "@/lib/companies";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

export default function SuggestCompany() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [role, setRole] = useState<"seeker" | "employee">("seeker");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const duplicate = LAUNCH_COMPANIES.some(company => company.name.toLowerCase() === name.trim().toLowerCase());

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="suggest-company-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">New doors</p>
        <h1 className="mt-2 text-3xl font-semibold">Suggest a company.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Sign in so we can follow up once reviewers look at your suggestion.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const submit = async () => {
    if (name.trim().length < 2) { setError("Name the company you want to see."); return; }
    setSubmitting(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/company-suggestions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ companyName: name.trim(), website: website.trim() || undefined, role }) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not save this suggestion");
      if (!response.ok) throw new Error(payload.error || "We could not save this suggestion");
      setDone(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not save this suggestion"); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <main data-skipwait-screen="suggest-company-done" className="mx-auto max-w-xl px-5 py-10 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--accent)]"><Check className="size-10 text-[var(--primary)]" /></span>
        <h1 className="mt-4 text-3xl font-semibold">Suggestion received.</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">Reviewers look at every suggestion. You can suggest up to 3 companies a day.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/explore" className="brand-button">Explore companies <ArrowRight /></Link>
        </div>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="suggest-company" className="page-content mx-auto max-w-2xl">
      <Link href="/explore" className="back-link"><ArrowLeft />Back to explore</Link>
      <div className="mb-6"><span className="eyebrow">New doors</span><h1 className="mt-2 text-4xl font-semibold">Suggest a company<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Tell us where you want to work — or where you work. Reviewers look at every suggestion.</p></div>
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-8">
        <label className="block text-sm font-semibold">Company name
          <input value={name} maxLength={160} onChange={event => { setName(event.target.value); setError(""); }} placeholder="Acme Corp" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
        </label>
        {duplicate ? <p className="mt-2 flex items-start gap-2 text-sm text-[var(--muted-foreground)]"><Building2 className="mt-0.5 size-4 shrink-0" />Good news — this company is already listed. <Link href={`/explore/${LAUNCH_COMPANIES.find(c => c.name.toLowerCase() === name.trim().toLowerCase())?.slug}`} className="text-link">Open it</Link></p> : null}
        <label className="mt-4 block text-sm font-semibold">Company website (optional)
          <input value={website} inputMode="url" onChange={event => { setWebsite(event.target.value); setError(""); }} placeholder="https://acme.example" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" />
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">I&apos;m suggesting as</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["seeker", "employee"] as const).map(value => (
              <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)} className={`min-h-11 rounded-xl border px-3 text-sm capitalize ${role === value ? "border-[var(--primary)] bg-[var(--primary)]/5 font-semibold" : "border-[var(--border)]"}`}>{value === "seeker" ? "Job seeker" : "Employee there"}</button>
            ))}
          </div>
        </fieldset>
        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
        <div className="mt-6 flex justify-end">
          <button type="button" disabled={submitting || duplicate} onClick={() => { void submit(); }} className="brand-button">{submitting ? "Sending…" : "Suggest company"}</button>
        </div>
      </section>
    </main>
  );
}
