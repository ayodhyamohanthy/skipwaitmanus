// The opened ask on the referral queue (design/goal-ui/pick/referral-queue.css
// .q-detail). Before acceptance it shows only what a referrer may see: the role,
// the job function and company, the job link the seeker sent, the seeker's own
// note as numbered reasons, the checks the payload actually proves, and a locked
// document count (DESIGN.md rule 12, shared/referrerAskView.ts). The name, the
// files and any score of the person never appear here.
import { useId, useState } from "react";
import { Check, ExternalLink, FileText, Lock } from "lucide-react";
import {
  GoalButton, GoalDecisionBar, GoalDetailPane, GoalLockedPanel, GoalNum, GoalPassReasons, GoalSheet,
} from "@/components/goal";
import { NO_PERSONAL_NOTE_TEXT } from "@shared/askNote";
import type { PassReasonCode } from "@shared/passReasons";
import { whyMeForReader } from "@shared/whyMe";
import type { CandidatePreview } from "@/components/referrer/CandidatePreviewCard";
import type { QueueRow } from "./queueRow";

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function dayMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : DAY_MONTH.format(new Date(at));
}

/** The job link as a referrer can read it, host and path only. */
function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function isHttpUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Only the checks the payload proves. No strength score, no invented pass. */
function askChecks(ask: CandidatePreview, documentCount: number): string[] {
  const checks: string[] = [];
  if (isHttpUrl(ask.targetRoleUrl)) checks.push("Official job link");
  if (ask.candidateMessage.trim() && ask.candidateMessage !== NO_PERSONAL_NOTE_TEXT) checks.push("A note with the ask");
  if (documentCount > 0) checks.push(documentCount === 1 ? "One document attached" : "Documents attached");
  return checks;
}

export type QueueAskProps = {
  row: QueueRow;
  ask: CandidatePreview;
  receivedAt: string;
  closesAt: string | null;
  position: { index: number; total: number; onPrev(): void; onNext(): void };
  onBack(): void;
  working: boolean;
  error: string;
  onAccept(): void;
  onPass(reason: PassReasonCode): void;
  passing: boolean;
};

export function QueueAsk({ row, ask, receivedAt, closesAt, position, onBack, working, error, onAccept, onPass, passing }: QueueAskProps) {
  const titleId = useId();
  const [passOpen, setPassOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const reasons = whyMeForReader(ask.candidateMessage);
  const hasNote = ask.candidateMessage.trim().length > 0 && ask.candidateMessage !== NO_PERSONAL_NOTE_TEXT;
  const checks = askChecks(ask, row.attachmentCount);
  const received = dayMonth(receivedAt);
  const closes = dayMonth(closesAt);
  const company = row.companyLabel;

  const meta: React.ReactNode[] = [];
  if (row.clockLabel) meta.push(row.clockLabel);
  if (closes) meta.push(<>Closes <GoalNum className="text-g-ink-2">{closes}</GoalNum></>);
  if (received) meta.push(<>Received <GoalNum className="text-g-ink-2">{received}</GoalNum></>);

  return (
    <div className="flex h-[calc(100vh-var(--g-topbar-h))] flex-col max-gdesk:h-auto">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GoalDetailPane
          labelledBy={titleId}
          eyebrow={row.functionLabel ? `${row.functionLabel} · ${company}` : company}
          title={row.roleTitle ?? row.rowTitle}
          titleSize="display"
          meta={meta}
          phoneBack={{ href: "/queue", label: "Referral queue", onClick: onBack }}
          phonePosition={<GoalNum className="text-g-ink-2">{`${position.index} / ${position.total}`}</GoalNum>}
        >
          <dl className="grid gap-2.5 border-t border-g-hairline pt-5">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-x-4 max-gdesk:grid-cols-[minmax(0,1fr)]">
              <dt className="text-g-meta text-g-ink-3">Job posting</dt>
              <dd className="min-w-0 text-g-body text-g-ink">
                {isHttpUrl(ask.targetRoleUrl) ? (
                  <a href={ask.targetRoleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 underline decoration-g-control-edge underline-offset-[3px]">
                    <span className="min-w-0 truncate">{linkLabel(ask.targetRoleUrl)}</span>
                    <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-g-ink-2" strokeWidth={1.75} />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="text-g-ink-2">No job link was sent with this ask.</span>
                )}
              </dd>
            </div>
          </dl>

          <section aria-labelledby={`${titleId}-why`} className="mt-8">
            <h3 id={`${titleId}-why`} className="text-g-label text-g-ink">Why me</h3>
            {hasNote ? (
              <ol className="mt-3 grid gap-3.5">
                {reasons.map((reason, index) => (
                  <li key={index} className="grid grid-cols-[32px_minmax(0,1fr)]">
                    <GoalNum className="text-g-ink-3" aria-hidden="true">{`0${index + 1}`}</GoalNum>
                    <p className="text-g-body text-g-ink" style={{ textWrap: "pretty" }}>{reason}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-g-meta text-g-ink-2">No note was sent with this ask.</p>
            )}
          </section>

          <section aria-labelledby={`${titleId}-checks`} className="mt-8">
            <h3 id={`${titleId}-checks`} className="text-g-label text-g-ink">Ask quality</h3>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {checks.map(check => (
                <li key={check} className="inline-flex items-center gap-1.5 text-g-meta text-g-ink-2">
                  <Check aria-hidden="true" className="size-4 text-g-ink" strokeWidth={2} />
                  {check}
                </li>
              ))}
              {checks.length === 0 ? <li className="text-g-meta text-g-ink-2">This ask carries no link, note or document yet.</li> : null}
            </ul>
            <p className="mt-2.5 text-g-meta text-g-ink-3">Checks on the ask, never a score of the person.</p>
          </section>

          <div className="mt-8">
            <GoalLockedPanel title="Identity and documents are shared after you accept" documentCount={row.attachmentCount} />
            <p className="mt-3 text-g-meta text-g-ink-2" style={{ textWrap: "pretty" }}>
              Accepting shares names both ways and their resume. Referring comes later, through {company}&rsquo;s own process.
            </p>
          </div>

          {error ? <p role="alert" className="mt-6 text-g-label text-g-ink">{error}</p> : null}
        </GoalDetailPane>
      </div>

      <GoalDecisionBar
        position={position}
        secondary={{ label: "Pass privately", keyHint: "P", onClick: () => setPassOpen(true), expanded: passOpen }}
        primary={{ label: "Accept & connect", keyHint: "A", onClick: () => setAcceptOpen(true), busy: working, busyLabel: "Accepting…" }}
      />

      <GoalPassReasons
        open={passOpen}
        onOpenChange={setPassOpen}
        title="Pass privately"
        description="The seeker sees a kind note with your reason. Never your name."
        note="With Prefer not to say, the seeker sees no reason."
        cancelLabel="Cancel"
        confirmLabel="Pass"
        onConfirm={reason => { setPassOpen(false); onPass(reason); }}
        onCancel={() => setPassOpen(false)}
      />

      <GoalSheet
        open={acceptOpen}
        onOpenChange={open => { if (!open && !passing) setAcceptOpen(false); }}
        title="Accept & connect"
        description={`Accepting shares your name and their name, and gives you their resume. Then you introduce them through ${company}'s own process.`}
      >
        <div className="mt-4 flex items-center gap-3 rounded-g-tile border border-g-hairline bg-g-surface-sunken px-4 py-3.5">
          <Lock aria-hidden="true" className="size-5 shrink-0 text-g-ink-2" strokeWidth={1.75} />
          <span className="text-g-label text-g-ink">Their note and their documents arrive with the introduction.</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-g-ink-3">
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <GoalNum>{row.attachmentCount}</GoalNum>
            <span className="text-g-meta">{row.attachmentCount === 1 ? "document" : "documents"}</span>
          </span>
        </div>
        <p className="mt-3 text-g-meta text-g-ink-2" style={{ textWrap: "pretty" }}>
          Accept only if you will refer them through the official process.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <GoalButton variant="ghost" touch="large" onClick={() => setAcceptOpen(false)}>Keep reviewing</GoalButton>
          <GoalButton variant="primary" touch="large" busy={working} busyLabel="Accepting…" onClick={() => { setAcceptOpen(false); onAccept(); }}>
            Accept & connect
          </GoalButton>
        </div>
      </GoalSheet>
    </div>
  );
}
