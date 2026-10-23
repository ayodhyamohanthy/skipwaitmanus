import { useState } from "react";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalField, GoalFilterChip, GoalTextInput } from "@/components/goal";
import { findListedCompanyByName, useCompanyDirectory } from "@/lib/companyDirectory";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type SuggestRole = "seeker" | "employee";
const ROLE_OPTIONS: ReadonlyArray<readonly [SuggestRole, string]> = [["seeker", "Looking to join"], ["employee", "Working there now"]];
const SITE_PATTERN = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i;

function normalizeCompanyWebsite(input: string): string | undefined {
  const site = input.trim();
  if (!site) return undefined;
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

export default function GoalSuggestCompany() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const directory = useCompanyDirectory({ enabled: Boolean(isSignedIn) });
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [role, setRole] = useState<SuggestRole>("seeker");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sentName, setSentName] = useState<string | null>(null);

  const listed = findListedCompanyByName(directory.data?.companies ?? [], name, "prefix");
  const siteOk = SITE_PATTERN.test(website.trim());

  if (!isSignedIn) {
    return <main data-skipwait-screen="suggest-company-sign-in" data-testid="goal-suggest-company" className="g-scope page-content mx-auto w-full max-w-xl pb-10">
      <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
        <h1 className="text-g-display text-g-ink">Bring a company onto skipwait.</h1>
        <p className="mt-2 text-g-meta text-g-ink-2">Real employers only. We review every suggestion before it appears.</p>
      </header>
      <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
        <h2 className="text-g-heading text-g-ink">Your next step</h2>
        <p className="mt-2 text-g-label text-g-ink">Sign in so we can follow up once reviewers look at your suggestion.</p>
        <div className="mt-4"><SignInButton><GoalButton variant="primary" asChild><button type="button">Sign in</button></GoalButton></SignInButton></div>
      </section>
    </main>;
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
    } catch (reason) { setError(reason instanceof TypeError ? "We could not save this suggestion. Check your connection, then try again." : reason instanceof Error ? reason.message : "We could not save this suggestion"); }
    finally { setSubmitting(false); }
  };

  if (sentName !== null) {
    return <main data-skipwait-screen="suggest-company-done" data-testid="goal-suggest-company" className="g-scope page-content mx-auto w-full max-w-xl pb-10">
      <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
        <h1 className="text-g-display text-g-ink">Bring a company onto skipwait.</h1>
        <p className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
          <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-ink" />
          <span>{sentName} is in review. We check the domain and careers page, then notify you.</span></p>
      </header>
      <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
        <h2 className="text-g-heading text-g-ink">Your next step</h2>
        <p className="mt-2 text-g-label text-g-ink">{role === "employee" ? "Verify your work email. Unlisted domains go to a person for review." : "Know someone there? Invite them to be the first referrer."}</p>
        <div className="mt-4"><GoalButton variant="primary" asChild>{role === "employee" ? <Link href="/verify">Verify work email</Link> : <Link href="/invite?mode=invite">Invite someone</Link>}</GoalButton></div>
      </section>
      <p className="mx-4 text-g-meta text-g-ink-3 gdesk:mx-5">You can suggest up to 3 companies a day.</p>
    </main>;
  }

  const blockedReason = submitting ? "Sending…" : name.trim().length < 2 ? "Name the company first" : !siteOk ? "Add the company website" : listed ? `${listed.name} is already listed` : undefined;

  return <main data-skipwait-screen="suggest-company" data-testid="goal-suggest-company" className="g-scope page-content mx-auto w-full max-w-xl pb-10">
    <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
      <h1 className="text-g-display text-g-ink">Bring a company onto skipwait.</h1>
      <p className="mt-2 text-g-meta text-g-ink-2">Real employers only. We review every suggestion before it appears.</p>
    </header>
    <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 className="text-g-heading text-g-ink">Your next step</h2>
      <div className="mt-4 grid gap-4">
        <GoalField label="Company name">
          <GoalTextInput value={name} maxLength={160} onChange={event => { setName(event.target.value); setError(""); }} placeholder="e.g. Freshworks" />
        </GoalField>
        {listed ? <p className="text-g-meta text-g-ink">{listed.name} is already on skipwait.me. <Link href={`/explore/${listed.slug}`} className="underline underline-offset-[3px]">Open it</Link></p> : null}
        {directory.isError && name.trim().length > 1 ? <p className="text-g-meta text-g-ink-3">We could not check the current company list. Reviewers still catch duplicates.</p> : null}
        <GoalField label="Website">
          <GoalTextInput value={website} inputMode="url" maxLength={500} onChange={event => { setWebsite(event.target.value); setError(""); }} placeholder="freshworks.com" />
        </GoalField>
        <GoalField label="You are">
          <div className="flex flex-wrap gap-2">{ROLE_OPTIONS.map(([value, label]) => (
            <GoalFilterChip key={value} label={label} pressed={role === value} onPressedChange={() => setRole(value)} />))}</div>
        </GoalField>
        {error ? <p role="alert" className="text-g-meta text-g-crimson">{error}</p> : null}
        <div><GoalButton variant="primary" disabledReason={blockedReason} onClick={() => { void submit(); }}>{submitting ? "Sending…" : "Submit for review"}</GoalButton></div>
      </div>
    </section>
  </main>;
}
