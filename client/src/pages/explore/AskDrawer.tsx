// The ask drawer (approved comp design/goal-ui/pick/find-a-referral.*): the
// job link with an honest hint, the resume (shared only after a referrer
// accepts), "Why me" as three reasons of up to 140 characters (D-077(4)), and
// the cost line beside Send ask from the first moment. The parent owns the
// form state, so closing the drawer keeps the draft.
import { Bell, FileText, Info, Lock } from "lucide-react";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "wouter";
import {
  GoalButton,
  GoalDrawer,
  GoalField,
  GoalNum,
  GoalReasonInput,
  GoalVerifiedMark,
  GoalTextInput,
} from "@/components/goal";
import type { PublicCompany } from "@shared/companies";
import { MONEY_SENTENCE, type AskCostLine } from "@shared/moneyCopy";
import { WHY_ME_MAX } from "@shared/whyMe";
import type { PinnedWorkState } from "@/components/ask/PinnedWorkPicker";
import { PinnedWorkPicker } from "@/components/ask/PinnedWorkPicker";
import type { LinkHint } from "./findModel";

export type AskResume = { name: string } | null;
export type AskSentView = { company: string; detail: string; slots: string | null; trackHref: string };

const PLACEHOLDERS = [
  "One result that proves you can do this job…",
  "Another result, with a number if you have one…",
  "A third reason: a skill the posting asks for, or why this team…",
] as const;

export type AskDrawerProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  company: PublicCompany | null;
  context: string | null;
  signedIn: boolean;
  url: string;
  onUrlChange(value: string): void;
  onUrlBlur(): void;
  hint: LinkHint;
  resume: AskResume;
  onPickResume(file: File | null): void;
  resumeError: string;
  reasons: readonly [string, string, string];
  onReasonChange(index: number, value: string): void;
  reasonsError: string;
  /** Task 13: the pieces this ask carries; the parent owns the state. */
  work: PinnedWorkState;
  watch: { state: "idle" | "busy" | "done" | "error"; message: string; onWatch(): void } | null;
  cost: AskCostLine;
  sendLabel: string;
  sendBusyLabel: string;
  sending: boolean;
  sendBlocked?: string;
  onSend(): void;
  onSaveDraft: (() => void) | null;
  draftState: "idle" | "saving" | "saved";
  error: ReactNode;
  sent: AskSentView | null;
  onAnother(): void;
};

export function AskDrawer(props: AskDrawerProps) {
  const { company, sent } = props;
  const linkId = useId();
  const resumeId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !props.sendBlocked && !props.sending) {
      event.preventDefault();
      props.onSend();
    }
  };
  const footer = sent ? (
    <div className="flex flex-wrap items-center justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-[1fr_2fr]">
      <GoalButton variant="ghost" touch="large" onClick={props.onAnother}>Ask at another company</GoalButton>
      <GoalButton asChild variant="primary" touch="large"><Link href={sent.trackHref}>Track this ask</Link></GoalButton>
    </div>
  ) : (
    <section aria-label="Your next step" className="max-h-[38dvh] overflow-y-auto overscroll-contain border border-g-control-edge p-3">
      <h2 className="mb-3 text-g-label text-g-ink">Your next step</h2>
      <p data-testid="goal-ask-cost" className="text-g-label text-g-ink">{props.cost.line}</p>
      <p className="text-pretty text-g-meta text-g-ink-2">{props.cost.detail}</p>
      <p data-testid="goal-money-sentence" className="text-pretty text-g-meta text-g-ink-3">{MONEY_SENTENCE}</p>
      {props.error ? <div role="alert" className="mt-1 text-pretty text-g-meta text-g-ink">{props.error}</div> : null}
      <div className="mt-4 flex items-center justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-[1fr_2fr]">
        {props.onSaveDraft ? (
          <GoalButton variant="ghost" touch="large" busy={props.draftState === "saving"} busyLabel="Saving…" onClick={props.onSaveDraft}>
            {props.draftState === "saved" ? "Draft saved" : "Save draft"}
          </GoalButton>
        ) : <span className="max-gdesk:hidden" />}
        <span aria-hidden="true" className="h-6 w-px bg-g-hairline max-gdesk:hidden" />
        <GoalButton variant="primary" touch="large" keys={[{ icon: "command" }, { icon: "corner-down-left" }]} busy={props.sending} busyLabel={props.sendBusyLabel} disabledReason={props.sendBlocked} onClick={props.onSend} className={props.onSaveDraft ? undefined : "max-gdesk:col-span-2"}>
          {props.sendLabel}
        </GoalButton>
      </div>
    </section>
  );

  return (
    <GoalDrawer open={props.open} onOpenChange={props.onOpenChange} title={sent ? "Ask sent" : "Ask for a referral"} context={props.context ?? undefined} closeLabel="Close" footer={footer}>
      {sent ? (
        <div className="grid gap-2" role="status">
          <p className="text-g-heading text-g-ink">Ask sent to {sent.company}.</p>
          <p className="text-pretty text-g-body text-g-ink-2">{sent.detail}</p>
          {sent.slots ? <p className="text-g-meta text-g-ink-2">{sent.slots}</p> : null}
        </div>
      ) : (
        <div className="contents" onKeyDown={onKeyDown}>
          <div className="grid gap-2">
            {company?.openToReferrals ? <GoalVerifiedMark>{`Goes to verified ${company.name} employees`}</GoalVerifiedMark> : null}
            <p className="text-pretty text-g-meta text-g-ink-2">Referrers see your job link and reasons. Your name and resume are shared only if one accepts.</p>
            {!props.signedIn ? <p className="text-pretty text-g-meta text-g-ink">You’ll sign in before it’s sent. We keep your link and reasons.</p> : null}
          </div>

          {company && !company.openToReferrals && props.watch ? (
            <div className="grid gap-1 rounded-g-tile border border-g-hairline bg-g-surface-sunken px-4 py-3.5">
              <p className="text-pretty text-g-label text-g-ink">No verified employee at {company.name} can take a new ask right now.</p>
              <p className="text-pretty text-g-meta text-g-ink-2">You can still send it: it waits for free until one can. Or get told when a referrer joins.</p>
              <div className="-ml-3 mt-1">
                <GoalButton variant="ghost" size="sm" leadingIcon={Bell} busy={props.watch.state === "busy"} busyLabel="Saving your alert…" onClick={props.watch.onWatch} disabledReason={props.watch.state === "done" ? "Your alert is saved." : undefined}>
                  Get told when a referrer joins
                </GoalButton>
              </div>
              <p role="status" className="text-g-meta text-g-ink-2">{props.watch.message}</p>
              <p className="text-g-meta text-g-ink-3">An alert is not a referral.</p>
            </div>
          ) : null}

          <GoalField
            label="Job link"
            htmlFor={linkId}
            hint={props.hint && props.hint.tone !== "error" ? { icon: Info, text: props.hint.text, tone: props.hint.tone === "pass" ? "pass" : "muted" } : undefined}
            error={props.hint?.tone === "error" ? props.hint.text : undefined}
          >
            <GoalTextInput
              id={linkId}
              autoFocus
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoComplete="url"
              spellCheck={false}
              placeholder={company ? `https://careers.${company.domains[0]}/…` : "Paste the job posting link…"}
              value={props.url}
              invalid={props.hint?.tone === "error"}
              onChange={event => props.onUrlChange(event.target.value)}
              onBlur={props.onUrlBlur}
            />
          </GoalField>

          <GoalField
            label="Resume"
            htmlFor={resumeId}
            hint={{ icon: Lock, text: props.resume ? "Shared after a referrer accepts" : "Add the resume you want a referrer to see", tone: "muted" }}
            error={props.resumeError || undefined}
          >
            {!props.signedIn ? (
              <p className="text-pretty text-g-meta text-g-ink-2">You’ll add your resume after you sign in.</p>
            ) : props.resume ? (
              <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-g-control border border-g-hairline py-2 pr-1.5 pl-3.5 max-gdesk:pr-1 max-gdesk:pl-3">
                <FileText aria-hidden="true" className="size-5 text-g-ink-2" strokeWidth={1.75} />
                <span title={props.resume.name} className="min-w-0 truncate text-g-body text-g-ink">{props.resume.name}</span>
                <label className="relative inline-flex h-9 cursor-pointer items-center rounded-g-control px-3 text-g-label text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out focus-within:shadow-g-focus hover:bg-g-surface-hover max-gdesk:h-11">
                  Change
                  <input id={resumeId} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" onChange={event => { props.onPickResume(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
                </label>
              </div>
            ) : (
              <label className="relative inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-g-control border border-g-control-edge px-3.5 text-g-label text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out focus-within:shadow-g-focus hover:bg-g-surface-hover max-gdesk:h-12">
                <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Add your resume
                <input id={resumeId} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" onChange={event => { props.onPickResume(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
              </label>
            )}
          </GoalField>

          <fieldset className="grid gap-2">
            <legend className="text-g-label text-g-ink">Why me</legend>
            <p className="-mt-1 mb-1 text-pretty text-g-meta text-g-ink-3">Three reasons, up to <GoalNum>{WHY_ME_MAX}</GoalNum> characters each. One specific result beats a list of skills.</p>
            {props.reasons.map((reason, index) => (
              <GoalReasonInput key={index} index={index} value={reason} max={WHY_ME_MAX} placeholder={PLACEHOLDERS[index]} onChange={value => props.onReasonChange(index, value)} />
            ))}
            {/* A screen names no status hue (R3): field-level errors stay inside GoalField. */}
            {props.reasonsError ? <p role="alert" className="text-g-meta text-g-ink">{props.reasonsError}</p> : null}
          </fieldset>

          <PinnedWorkPicker work={props.work} />
        </div>
      )}
    </GoalDrawer>
  );
}
