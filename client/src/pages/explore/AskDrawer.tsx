// The ask drawer (approved comp design/goal-ui/pick/find-a-referral.*): the
// job link with an honest hint, the resume (shared only after a referrer
// accepts), "Why me" as three reasons of up to 140 characters (D-077(4)), and
// the cost line beside Send ask from the first moment. The parent owns the
// form state, so closing the drawer keeps the draft.
import { FileText, Info, Lock } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "wouter";
import {
  GoalButton,
  GoalDrawer,
  GoalField,
  GoalFieldError,
  GoalNum,
  GoalReasonInput,
  GoalVerifiedMark,
  GoalTextInput,
} from "@/components/goal";
import type { PublicCompany } from "@shared/companies";
import type { CatalogJob } from "@shared/jobCatalog";
import { JOB_LEVEL_LABELS, type JobLevel } from "@shared/jobLevel";
import { ADD_CREDITS_HREF, ADD_CREDITS_LABEL, MONEY_SENTENCE, type AskCostLine } from "@shared/moneyCopy";
import { WHY_ME_MAX } from "@shared/whyMe";
import type { PinnedWorkState } from "@/components/ask/PinnedWorkPicker";
import { PinnedWorkPicker } from "@/components/ask/PinnedWorkPicker";
import type { LinkHint } from "./findModel";
import { JobLinkFromPosting } from "./JobLinkFromPosting";
import { ReasonsCoach } from "./ReasonsCoach";

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
  onUrlChange(value: string, pasted?: boolean): void;
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
  /** D-174: whether a posted role is selected, showing read-only link and Change role */
  isPostSelected?: boolean;
  postSelection?: { opportunityId?: number | null } | null;
  onChangeRole?: () => void;
  /** D-174: whether a careers-site catalog job is selected, showing read-only title/location/level/link and Change job */
  jobSelection?: CatalogJob | null;
  onChangeJob?: () => void;
  /** D-132 item 3 (flag VITE_ASK_LEVEL_COST): set when the by-level quote is short; the primary action becomes the top-up. */
  topUp: { shortfall: number; href?: string } | null;
  onTopUp?: (event?: React.MouseEvent) => void;
  sendLabel: string;
  sendBusyLabel: string;
  sending: boolean;
  sendBlocked?: string;
  sendGuidance?: string | null;
  /** True once the seeker pressed Send: what still stops the send is shown as an error (crimson), not a hint. */
  sendAttempted?: boolean;
  creditRecovery?: boolean;
  onSend(): void;
  /** A press on a blocked Send (button or keyboard): marks the attempt so the reason shows as an error. */
  onBlockedSend?: () => void;
  /** The first field to fix before Send can go; a press moves focus there. */
  sendProblemField?: "link" | "resume" | "reasons" | null;
  /** The job link's posting belongs to another company: the field is marked invalid. */
  linkBlocked?: boolean;
  onSaveDraft: (() => void) | null;
  draftState: "idle" | "saving" | "saved";
  error: ReactNode;
  sent: AskSentView | null;
  onAnother(): void;
};

/** A catalog level is a plain number; only a known 1-10 level has an honest label. */
const jobLevelLabel = (level: number): string | null =>
  Number.isInteger(level) && level >= 1 && level <= 10 ? JOB_LEVEL_LABELS[level as JobLevel] : null;

export function AskDrawer(props: AskDrawerProps) {
  const { company, sent } = props;
  const isPostSelected = Boolean(props.isPostSelected || props.postSelection?.opportunityId);
  const linkId = useId();
  const resumeId = useId();
  const reasonsRef = useRef<HTMLFieldSetElement>(null);
  // A press with something left to fix takes the seeker to it: the field scrolls into view and takes focus,
  // while the same words show in crimson at the field, beside Send and in a toast.
  const focusProblem = () => {
    const field = props.sendProblemField;
    const target = field === "link" ? document.getElementById(linkId)
      : field === "resume" ? document.getElementById(resumeId)
        : field === "reasons" ? reasonsRef.current?.querySelector("textarea") ?? null : null;
    if (!target) return;
    target.scrollIntoView?.({ block: "center" });
    target.focus({ preventScroll: true });
  };
  const pressSend = () => { if (props.sendProblemField) focusProblem(); props.onSend(); };
  const pressBlockedSend = () => { props.onBlockedSend?.(); focusProblem(); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !props.sending) {
      event.preventDefault();
      if (props.sendBlocked) pressBlockedSend();
      else pressSend();
    }
  };
  const footer = sent ? (
    <div className="flex flex-wrap items-center justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-[1fr_2fr]">
      <GoalButton variant="ghost" touch="large" onClick={props.onAnother}>New request</GoalButton>
      <GoalButton asChild variant="primary" touch="large"><Link href={sent.trackHref}>Track this request</Link></GoalButton>
    </div>
  ) : (
    <>
      <p data-testid="goal-ask-cost" className="text-g-label text-g-ink">{props.cost.line}</p>
      <p className="text-pretty text-g-meta text-g-ink-2">{props.cost.detail}</p>
      <p data-testid="goal-money-sentence" className="text-pretty text-g-meta text-g-ink-3">{MONEY_SENTENCE}</p>
      {/* One line per message: after a press the send error repeats a missing-field reason, so it is shown once. */}
      {props.sendGuidance && props.sendGuidance !== props.error ? (
        <div data-testid="ask-send-guidance" className="mt-2">
          {props.sendAttempted
            ? <GoalFieldError role="alert">{props.sendGuidance}</GoalFieldError>
            : <p role="status" className="text-pretty text-g-meta text-g-ink">{props.sendGuidance}</p>}
        </div>
      ) : null}
      {props.creditRecovery ? <Link href="/plans" className="inline-flex min-h-11 items-center text-g-meta text-g-ink underline underline-offset-4">View referral options</Link> : null}
      {props.error ? <div data-testid="ask-send-error" className="mt-1"><GoalFieldError role="alert">{props.error}</GoalFieldError></div> : null}
      <div className="mt-4 flex items-center justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-[1fr_2fr]">
        {props.onSaveDraft ? (
          <GoalButton variant="ghost" touch="large" busy={props.draftState === "saving"} busyLabel="Saving…" onClick={props.onSaveDraft}>
            {props.draftState === "saved" ? "Draft saved" : "Save draft"}
          </GoalButton>
        ) : <span className="max-gdesk:hidden" />}
        <span aria-hidden="true" className="h-6 w-px bg-g-hairline max-gdesk:hidden" />
        {props.topUp ? (
          <GoalButton asChild variant="primary" touch="large" className={props.onSaveDraft ? undefined : "max-gdesk:col-span-2"}>
            <Link href={props.topUp?.href ?? ADD_CREDITS_HREF} onClick={props.onTopUp}>{ADD_CREDITS_LABEL}</Link>
          </GoalButton>
        ) : (
          <GoalButton variant="primary" touch="large" keys={[{ icon: "command" }, { icon: "corner-down-left" }]} busy={props.sending} busyLabel={props.sendBusyLabel} disabledReason={props.sendBlocked} onBlockedClick={pressBlockedSend} onClick={pressSend} className={props.onSaveDraft ? undefined : "max-gdesk:col-span-2"}>
            {props.sendLabel}
          </GoalButton>
        )}
      </div>
    </>
  );

  return (
    <GoalDrawer open={props.open} onOpenChange={props.onOpenChange} title={sent ? "Referral request sent" : "Request a referral"} context={props.context ?? undefined} closeLabel="Close" footer={footer}>
      {sent ? (
        <div className="grid gap-2" role="status">
          <p className="text-g-heading text-g-ink">Referral request sent to {sent.company}.</p>
          <p className="text-pretty text-g-body text-g-ink-2">{sent.detail}</p>
          {sent.slots ? <p className="text-g-meta text-g-ink-2">{sent.slots}</p> : null}
        </div>
      ) : (
        <div className="contents" onKeyDown={onKeyDown}>
          <div className="grid gap-2">
            {company ? <GoalVerifiedMark>{`Only verified ${company.name} employees can see it`}</GoalVerifiedMark> : null}
            <p className="text-pretty text-g-meta text-g-ink-2">Referrers see your job link and reasons. Your name and resume are shared only if one accepts.</p>
            {!props.signedIn ? <p className="text-pretty text-g-meta text-g-ink">You’ll sign in before it’s sent. We keep your link and reasons.</p> : null}
          </div>

          {props.jobSelection ? (
            <div className="grid gap-2">
              <div className="rounded-g-control border border-g-hairline bg-g-surface-sunken p-3">
                <h3 className="break-words text-g-label text-g-ink">{props.jobSelection.title}</h3>
                <p className="mt-1 break-words text-g-meta text-g-ink-3">
                  {props.jobSelection.locations.join(" · ") || props.jobSelection.rawLocation || "Location not stated"}
                </p>
                <p className="mt-0.5 break-words text-g-meta text-g-ink-3">{jobLevelLabel(props.jobSelection.level) ?? "Level not stated"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={props.jobSelection.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-g-meta text-g-ink-2 underline decoration-g-hairline underline-offset-2 hover:text-g-ink"
                >
                  {`View posting for ${props.jobSelection.title}`}
                </a>
                {props.onChangeJob ? (
                  <GoalButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-g-meta text-g-ink-2 hover:text-g-ink"
                    onClick={props.onChangeJob}
                  >
                    Change job
                  </GoalButton>
                ) : null}
              </div>
            </div>
          ) : (
            <GoalField
              label="Job link"
              htmlFor={linkId}
              hint={props.hint && props.hint.tone !== "error" && !props.linkBlocked ? { icon: Info, text: props.hint.text, tone: props.hint.tone === "pass" ? "pass" : "muted" } : undefined}
              error={props.hint?.tone === "error" ? props.hint.text : undefined}
            >
              {isPostSelected ? (
                <div className="flex items-center gap-2">
                  <GoalTextInput
                    id={linkId}
                    readOnly
                    aria-readonly="true"
                    type="url"
                    value={props.url}
                    className="bg-g-surface-sunken text-g-ink-2"
                  />
                  {props.onChangeRole ? (
                    <GoalButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-g-meta text-g-ink-2 hover:text-g-ink"
                      onClick={props.onChangeRole}
                    >
                      Change role
                    </GoalButton>
                  ) : null}
                </div>
              ) : (
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
                  invalid={props.hint?.tone === "error" || props.linkBlocked === true}
                  onChange={event => props.onUrlChange(event.target.value, (event.nativeEvent as InputEvent).inputType === "insertFromPaste")}
                  onBlur={props.onUrlBlur}
                />
              )}
            </GoalField>
          )}

          {/* D-094 item 2 (switch off): what the posting says, under its link. */}
          <JobLinkFromPosting url={props.url} company={company} />

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

          <fieldset ref={reasonsRef} className="grid gap-2">
            <legend className="text-g-label text-g-ink">Why me</legend>
            <p className="-mt-1 mb-1 text-pretty text-g-meta text-g-ink-3">Three reasons, up to <GoalNum>{WHY_ME_MAX}</GoalNum> characters each. One specific result beats a list of skills.</p>
            {props.reasons.map((reason, index) => (
              <GoalReasonInput key={index} index={index} value={reason} max={WHY_ME_MAX} placeholder={PLACEHOLDERS[index]} onChange={value => props.onReasonChange(index, value)} />
            ))}
            {/* A screen names no status hue (R3): the crimson error line comes from the GoalField primitive. */}
            {props.reasonsError ? <GoalFieldError role="alert">{props.reasonsError}</GoalFieldError> : null}
            <ReasonsCoach reasons={props.reasons} signedIn={props.signedIn} companyName={props.company?.name} />
          </fieldset>

          <PinnedWorkPicker work={props.work} />
        </div>
      )}
    </GoalDrawer>
  );
}
