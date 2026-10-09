import { AlertTriangle, ArrowRight, Building2, Check } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { Heading, Panel, field } from "@/components/kit/preview-kit";
import { LAUNCH_COMPANIES } from "@/lib/companies";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

// Kit v4 /suggest-company (app/src/routes/suggest-company.tsx) on the live
// POST /api/company-suggestions intake (auth required, 3 a day, open-duplicate
// check server side).
type SuggestRole = "seeker" | "employee";
const ROLES: ReadonlyArray<readonly [SuggestRole, string]> = [["seeker", "Looking to join"], ["employee", "Working there now"]];
const SITE_PATTERN = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i;

/** The API only accepts http(s) URLs; a bare domain like "freshworks.com" gets https://. */
function normalizeCompanyWebsite(input: string): string | undefined {
  const site = input.trim();
  if (!site) return undefined;
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

export default function SuggestCompany() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [role, setRole] = useState<SuggestRole>("seeker");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sentName, setSentName] = useState<string | null>(null);

  const listed = LAUNCH_COMPANIES.find(company => company.name.toLowerCase() === name.trim().toLowerCase());
  const siteOk = !website.trim() || SITE_PATTERN.test(website.trim());

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="suggest-company-sign-in" className="page-content mx-auto max-w-2xl">
        <Heading eyebrow="GROW THE MAP" title="Suggest a company" text="Real employers only. We review every suggestion before it appears." />
        <Panel>
          <p className="text-sm text-muted-foreground">Sign in so we can follow up once reviewers look at your suggestion.</p>
          <SignInButton><button type="button" className={buttonVariants({ className: "mt-6 w-full" })}>Sign in <ArrowRight /></button></SignInButton>
        </Panel>
      </main>
    );
  }

  const submit = async () => {
    if (name.trim().length < 2) { setError("Name the company you want to see."); return; }
    if (!siteOk) return;
    setSubmitting(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/company-suggestions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ companyName: name.trim(), website: normalizeCompanyWebsite(website), role }) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not save this suggestion");
      if (!response.ok) throw new Error(payload.error || "We could not save this suggestion");
      setSentName(name.trim());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not save this suggestion"); }
    finally { setSubmitting(false); }
  };

  if (sentName !== null) {
    return (
      <main data-skipwait-screen="suggest-company-done" className="page-content mx-auto max-w-xl text-center">
        <Check className="mx-auto size-12 text-primary" />
        <h1 className="mt-4 text-3xl font-semibold">Thanks — {sentName} is in review.</h1>
        <p className="mt-2 text-muted-foreground">We check the domain and careers page. We&apos;ll notify you when it&apos;s reviewed.</p>
        <Panel tone="muted" className="mt-6 text-left">
          <strong>Speed it up</strong>
          <p className="mt-1 text-sm text-muted-foreground">{role === "employee" ? "Verify your work email — unlisted domains go to a person for review." : "Know someone there? Invite them to be the first referrer."}</p>
          <Button asChild className="mt-3">{role === "employee" ? <Link href="/verify">Verify work email</Link> : <Link href="/invite?mode=invite">Invite someone</Link>}</Button>
        </Panel>
        <p className="mt-4 text-xs text-muted-foreground">You can suggest up to 3 companies a day.</p>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="suggest-company" className="page-content mx-auto max-w-2xl">
      <Heading eyebrow="GROW THE MAP" title="Suggest a company" text="Real employers only. We review every suggestion before it appears." />
      <Panel>
        <label className="block text-sm font-medium">Company name<input className={field} value={name} maxLength={160} onChange={event => { setName(event.target.value); setError(""); }} placeholder="e.g. Freshworks" /></label>
        {listed ? <p className="mt-2 flex items-center gap-2 text-sm"><AlertTriangle className="size-4" />{listed.name} is already on SkipWait. <Link href={`/explore/${listed.slug}`} className="text-link">Open it</Link></p> : null}
        <label className="mt-4 block text-sm font-medium">Website<input className={field} value={website} inputMode="url" maxLength={500} onChange={event => { setWebsite(event.target.value); setError(""); }} placeholder="freshworks.com" /></label>
        {siteOk ? null : <p className="mt-2 text-sm text-muted-foreground">Enter the company website, like freshworks.com.</p>}
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">You are</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)} className={`flex min-h-12 items-center gap-2 rounded-xl border px-4 text-left ${role === value ? "border-primary bg-primary/5" : "border-border"}`}><Building2 className="size-4" />{label}</button>
            ))}
          </div>
        </fieldset>
        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}
        <Button className="mt-6 w-full" disabled={submitting || name.trim().length < 2 || !siteOk || Boolean(listed)} onClick={() => { void submit(); }}>{submitting ? "Sending…" : <>Submit for review <ArrowRight /></>}</Button>
      </Panel>
    </main>
  );
}
