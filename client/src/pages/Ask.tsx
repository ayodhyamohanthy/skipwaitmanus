// The ask composer as a page (D-048 phase 3 W2; comp design/goal-ui/w2/ask-*.png):
// the W1 drawer's anatomy at full width - job link with an honest hint, the
// resume (shared only after a referrer accepts), "Why me" as three reasons of
// up to 140 characters (D-077(4)), and the cost line with the refund rules
// beside one black Send ask from the first moment (no drip pricing). The form,
// draft, caps and the live send come from useAskComposer, shared with the
// directory drawer and the company door. Flags off: "Uses 1 of your N credits".
import { ArrowLeft, FileText, Info, Lock } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import {
  GoalAppShell,
  GoalButton,
  GoalField,
  GoalNum,
  GoalReasonInput,
  GoalStatus,
  GoalTextInput,
  GoalVerifiedMark,
} from "@/components/goal";
import { PinnedWorkPicker } from "@/components/ask/PinnedWorkPicker";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readAskPrefill } from "@/lib/askPrefill";
import { useAskDraft } from "@/lib/askDraftApi";
import { useCompanyDirectory, type PublicCompany } from "@/lib/companyDirectory";
import { applySeo } from "@/lib/seo";
import { ADD_CREDITS_HREF, ADD_CREDITS_LABEL } from "@shared/moneyCopy";
import { jobLinkFitsCompany, isValidTargetRoleUrl } from "@shared/referralUrl";
import { WHY_ME_MAX } from "@shared/whyMe";
import { useAskComposer } from "./explore/useAskComposer";

const PLACEHOLDERS = [
  "One result that proves you can do this job…",
  "Another result, with a number if you have one…",
  "A third reason: a skill the posting asks for, or why this team…",
] as const;

export default function Ask() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  // The company the ask belongs to: the sign-in handoff prefill first, then a
  // saved draft, then the company whose verified domain the job link matches.
  const [prefill] = useState(() => readAskPrefill());
  const draft = useAskDraft(Boolean(isLoaded && isSignedIn), fetchToken);
  const directory = useCompanyDirectory();
  const [urlCompany, setUrlCompany] = useState<PublicCompany | null>(null);

  const slugCompany = (() => {
    const slug = prefill?.companySlug ?? draft?.companySlug;
    return directory.data?.companies.find(company => company.slug === slug) ?? null;
  })();
  const company = slugCompany ?? urlCompany;

  const composer = useAskComposer(company);

  useEffect(() => {
    const companies = directory.data?.companies;
    if (!companies || !isValidTargetRoleUrl(composer.url.trim())) { setUrlCompany(null); return; }
    setUrlCompany(companies.find(item => jobLinkFitsCompany(composer.url, item.domains)) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composer.url, directory.data]);

  useEffect(() => {
    applySeo({ title: "Ask for a referral", description: "Ask a verified employee for a referral. Your name and resume stay private until one accepts.", path: "/ask" });
  }, []);

  const sent = composer.sent;
  return (
    <GoalAppShell active="find" pageTitle="Ask for a referral">
      <div data-skipwait-screen="ask" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6 max-gdesk:pb-6">
        <Link href={company ? `/explore/${company.slug}` : "/explore"} className="inline-flex min-h-11 items-center gap-1 text-g-meta text-g-ink-2 hover:text-g-ink">
          <ArrowLeft aria-hidden="true" className="size-4" />{company ? company.name : "All companies"}
        </Link>

        {sent ? (
          <div className="mt-8" role="status">
            <h1 className="text-g-display text-g-ink">Ask sent to {sent.company}.</h1>
            <GoalStatus className="mt-4" status="waiting" label="Waiting" stepper={{ stage: 0 }} />
            <p className="mt-4 text-pretty text-g-body text-g-ink-2">{sent.detail}</p>
            {sent.slots ? <p className="mt-2 text-g-meta text-g-ink-3">{sent.slots}</p> : null}
            <div className="mt-6 flex flex-wrap items-center gap-2 max-gdesk:grid">
              <GoalButton asChild variant="ghost" touch="large"><Link href="/explore">Ask another company</Link></GoalButton>
              <GoalButton asChild variant="primary" touch="large"><Link href="/requests">See my asks</Link></GoalButton>
            </div>
          </div>
        ) : (
          <>
            <header className="mt-6">
              <h1 className="text-g-display text-g-ink">Ask for a referral</h1>
              {composer.context ? <p className="mt-1 truncate text-g-meta text-g-ink-3">{composer.context}</p> : null}
            </header>

            <div className="mt-5 grid gap-2">
              {company?.openToReferrals ? <GoalVerifiedMark mutedText className="font-semibold text-g-ink">{`Goes to verified ${company.name} employees`}</GoalVerifiedMark> : null}
              <p className="text-pretty text-g-body text-g-ink-2">Referrers see your job link and reasons. Your name and resume are shared only if one accepts.</p>
              {!composer.signedIn ? <p className="text-pretty text-g-meta text-g-ink-2">You’ll sign in before it’s sent. We keep your link and reasons.</p> : null}
            </div>

            <div className="mt-8 grid gap-6">
              <AskFields composer={composer} company={company} />
            </div>

            <div className="mt-8 border-t border-g-hairline pt-5">
              <p data-testid="goal-ask-cost" className="text-g-label text-g-ink">{composer.cost.line}</p>
              <p className="mt-1 text-pretty text-g-meta text-g-ink-2">{composer.cost.detail}</p>
              {composer.sendGuidance ? <p data-testid="ask-send-guidance" role="status" className="mt-3 text-pretty text-g-meta text-g-ink">{composer.sendGuidance}</p> : null}
              {composer.creditRecovery ? <Link href="/plans" className="mt-2 inline-flex min-h-11 items-center text-g-meta text-g-ink underline underline-offset-4">View referral options</Link> : null}
              {composer.sendError ? <div role="alert" className="mt-2 text-pretty text-g-meta text-g-ink">{composer.sendError}</div> : null}
              <div className="mt-4 flex items-center justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-1">
                {composer.onSaveDraft ? (
                  <GoalButton variant="ghost" touch="large" className="max-gdesk:w-full" busy={composer.draftState === "saving"} busyLabel="Saving…" onClick={composer.onSaveDraft}>
                    {composer.draftState === "saved" ? "Draft saved" : "Save draft"}
                  </GoalButton>
                ) : null}
                {composer.topUp ? (
                  <GoalButton asChild variant="primary" touch="large" className="max-gdesk:w-full">
                    <Link href={composer.topUp?.href ?? ADD_CREDITS_HREF} onClick={composer.onTopUp}>{ADD_CREDITS_LABEL}</Link>
                  </GoalButton>
                ) : (
                  <GoalButton variant="primary" touch="large" className="max-gdesk:w-full" busy={composer.sending} busyLabel={composer.sendBusyLabel} disabledReason={composer.sendBlocked} onClick={composer.send}>
                    {composer.sendLabel}
                  </GoalButton>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </GoalAppShell>
  );
}

type Composer = ReturnType<typeof useAskComposer>;

function AskFields({ composer, company }: { composer: Composer; company: PublicCompany | null }) {
  const linkId = useId();
  const resumeId = useId();
  return (
    <>
      <GoalField
        label="Job link"
        htmlFor={linkId}
        hint={composer.hint && composer.hint.tone !== "error" ? { icon: Info, text: composer.hint.text, tone: composer.hint.tone === "pass" ? "pass" : "muted" } : undefined}
        error={composer.hint?.tone === "error" ? composer.hint.text : undefined}
      >
        <GoalTextInput
          id={linkId}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoComplete="url"
          spellCheck={false}
          placeholder={company ? `https://careers.${company.domains[0]}/…` : "Paste the job posting link…"}
          value={composer.url}
          invalid={composer.hint?.tone === "error"}
          onChange={event => composer.onUrlChange(event.target.value)}
          onBlur={composer.onUrlBlur}
        />
      </GoalField>
      {composer.postSelection ? (
        <p className="-mt-4 text-pretty text-g-meta text-g-ink-3">The employee who posted this role sees your ask first, for 24 hours. After that, other verified referrers at the company can pick it up.</p>
      ) : null}

      <GoalField
        label="Resume"
        htmlFor={resumeId}
        hint={{ icon: Lock, text: composer.resumeView ? "Shared after a referrer accepts" : "Add the resume you want a referrer to see", tone: "muted" }}
        error={composer.resumeError || undefined}
      >
        {!composer.signedIn ? (
          <p className="text-pretty text-g-meta text-g-ink-2">You’ll add your resume after you sign in.</p>
        ) : composer.resumeView ? (
          <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-g-control border border-g-hairline py-2 pr-1.5 pl-3.5 max-gdesk:pr-1 max-gdesk:pl-3">
            <FileText aria-hidden="true" className="size-5 text-g-ink-2" strokeWidth={1.75} />
            <span title={composer.resumeView.name} className="min-w-0 truncate text-g-body text-g-ink">{composer.resumeView.name}</span>
            <label className="relative inline-flex h-9 cursor-pointer items-center rounded-g-control px-3 text-g-label text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out focus-within:shadow-g-focus hover:bg-g-surface-hover max-gdesk:h-11">
              Change
              <input id={resumeId} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" onChange={event => { composer.pickResume(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
            </label>
          </div>
        ) : (
          <label className="relative inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-g-control border border-g-control-edge px-3.5 text-g-label text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out focus-within:shadow-g-focus hover:bg-g-surface-hover max-gdesk:h-12">
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Add your resume
            <input id={resumeId} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" onChange={event => { composer.pickResume(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
          </label>
        )}
      </GoalField>

      <fieldset className="grid gap-2">
        <legend className="text-g-label text-g-ink">Why me</legend>
        <p className="-mt-1 mb-1 text-pretty text-g-meta text-g-ink-3">Three reasons, up to <GoalNum>{WHY_ME_MAX}</GoalNum> characters each. One specific result beats a list of skills.</p>
        {composer.reasons.map((reason, index) => (
          <GoalReasonInput key={index} index={index} value={reason} max={WHY_ME_MAX} placeholder={PLACEHOLDERS[index]} onChange={value => composer.onReasonChange(index, value)} />
        ))}
        {composer.reasonsError ? <p role="alert" className="text-g-meta text-g-ink">{composer.reasonsError}</p> : null}
      </fieldset>

      <PinnedWorkPicker work={composer.work} />
    </>
  );
}
