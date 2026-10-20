/**
 * src/components/referrer/ReferrerCockpit.tsx
 * skipwait.me Kinetic · Referrer Cockpit. Polaris-style triage queue inside <AppShell>.
 * ─────────────────────────────────────────────────────────────────────────
 */
import {useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode} from "react";
import {Chip, PrimaryButton, SecondaryButton, SplitActionButton, StatusPill, SvgIcon, VerifiedBadge, cx, type IconProps, type ReferralStatus, type SplitActionMenuItem} from "@/components/ui/primitives";

export type PassReason = "experience-gap" | "role-mismatch" | "role-filled" | "cannot-vouch";
export type RequestDecision = "referred" | "declined";

export interface CandidateProfile {
  name: string;
  headline: string;
  verifiedDomain?: string | null;
  yearsExperience: number | null;
  primarySkill?: string | null;
  resumeUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
}

export interface IncomingRequest {
  id: string;
  roleTitle: string;
  team?: string | null;
  jobReference: string;
  slaDeadline: string;
  decision?: RequestDecision | null;
  candidate: CandidateProfile;
  pitch: readonly string[];
}

export interface ReferrerCockpitProps {
  requests: readonly IncomingRequest[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefer: (requestId: string) => Promise<unknown>;
  onPass: (requestId: string, reason: PassReason) => Promise<unknown>;
  onRequestInfo?: (requestId: string) => Promise<unknown>;
  onSnooze?: (requestId: string) => Promise<unknown>;
}

const HOUR_MS = 3_600_000;
const EXPIRING_THRESHOLD_MS = 24 * HOUR_MS;
const NOTICE_DURATION_MS = 2_500;
const SKELETON_ROWS = 4;

const PASS_REASONS: ReadonlyArray<{ id: PassReason; label: string }> = [
  { id: "experience-gap", label: "Experience Gap" },
  { id: "role-mismatch", label: "Different Role Fit" },
  { id: "role-filled", label: "Role Is Filled" },
  { id: "cannot-vouch", label: "Can't Vouch Yet" },
];

type LocalOutcome = "referred" | "declined" | "snoozed" | "asked";
type DecisionAction = { kind: "refer" } | { kind: "pass"; reason: PassReason } | { kind: "info" } | { kind: "snooze" };
type ActionKind = DecisionAction["kind"];

interface RequestState {
  status: ReferralStatus;
  meta?: string;
  active: boolean;
  remainingMs: number | null;
}

interface QueueRowModel {
  request: IncomingRequest;
  state: RequestState;
}

function FileIcon({ className }: IconProps) {
  return (
    <SvgIcon className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </SvgIcon>
  );
}

function BriefcaseIcon({ className }: IconProps) {
  return (
    <SvgIcon className={className}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </SvgIcon>
  );
}

function ExternalLinkIcon({ className }: IconProps) {
  return (
    <SvgIcon className={className}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </SvgIcon>
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${pad(hours)}h`;
  if (hours > 0) return `${pad(hours)}h ${pad(minutes)}m`;
  return `${pad(minutes)}m ${pad(seconds)}s`;
}

function parseDeadline(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function resolveRequestState(request: IncomingRequest, outcome: LocalOutcome | undefined, now: number): RequestState {
  const decision = outcome ?? request.decision ?? null;
  if (decision === "referred") return { status: "referred", active: false, remainingMs: null };
  if (decision === "declined") return { status: "declined", active: false, remainingMs: null };
  if (decision === "snoozed") return { status: "pending", meta: "snoozed", active: false, remainingMs: null };
  
  const deadline = parseDeadline(request.slaDeadline);
  if (deadline === Number.POSITIVE_INFINITY) {
    return { status: "pending", meta: decision === "asked" ? "asked" : undefined, active: true, remainingMs: null };
  }
  const remainingMs = deadline - now;
  if (remainingMs <= 0) return { status: "expired", active: false, remainingMs: 0 };
  const countdown = formatCountdown(remainingMs);
  return {
    status: remainingMs < EXPIRING_THRESHOLD_MS ? "expiring" : "pending",
    meta: decision === "asked" ? `${countdown} · asked` : countdown,
    active: true,
    remainingMs,
  };
}

function isAwaitingDecision(request: IncomingRequest, outcome: LocalOutcome | undefined): boolean {
  const decision = outcome ?? request.decision ?? null;
  return decision === null || decision === "asked";
}

function roleLabel(request: IncomingRequest): string {
  return request.team ? `${request.roleTitle} · ${request.team}` : request.roleTitle;
}

function initials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0] ?? "").join("");
  return letters.toUpperCase() || "?";
}

function experienceLabel(candidate: CandidateProfile): string {
  const years = candidate.yearsExperience;
  const parts = [years === null ? null : `${years} yr${years === 1 ? "" : "s"}`, candidate.primarySkill ?? null].filter(Boolean);
  return parts.join(" · ") || "Experience not listed";
}

export function ReferrerCockpit({ requests, isLoading = false, error = null, onRetry, onRefer, onPass, onRequestInfo, onSnooze }: ReferrerCockpitProps) {
  const [outcomes, setOutcomes] = useState<Record<string, LocalOutcome>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [passTrayOpen, setPassTrayOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const deadlines = useMemo(() => requests.map((r) => parseDeadline(r.slaDeadline)), [requests]);
  const now = useSlaClock(deadlines);

  const queueRows = useMemo<readonly QueueRowModel[]>(() => {
    return requests.map((request) => ({
      request,
      state: resolveRequestState(request, outcomes[request.id], now),
    }));
  }, [requests, outcomes, now]);

  const awaitingRows = useMemo(() => queueRows.filter((r) => isAwaitingDecision(r.request, outcomes[r.request.id])), [queueRows, outcomes]);
  const doneRows = useMemo(() => queueRows.filter((r) => !isAwaitingDecision(r.request, outcomes[r.request.id])), [queueRows, outcomes]);

  useEffect(() => {
    if (awaitingRows.length > 0 && (!selectedId || !awaitingRows.some((r) => r.request.id === selectedId))) {
      setSelectedId(awaitingRows[0].request.id);
    } else if (awaitingRows.length === 0 && doneRows.length > 0 && (!selectedId || !doneRows.some((r) => r.request.id === selectedId))) {
      setSelectedId(doneRows[0].request.id);
    }
  }, [awaitingRows, doneRows, selectedId]);

  const selectedRow = useMemo(() => queueRows.find((r) => r.request.id === selectedId) ?? awaitingRows[0] ?? queueRows[0] ?? null, [queueRows, awaitingRows, selectedId]);

  const advanceQueue = useCallback((currentId: string) => {
    const currentIndex = awaitingRows.findIndex((r) => r.request.id === currentId);
    if (currentIndex !== -1 && awaitingRows.length > 1) {
      const next = awaitingRows[currentIndex + 1] ?? awaitingRows[currentIndex - 1];
      if (next) setSelectedId(next.request.id);
    }
  }, [awaitingRows]);

  const executeAction = async (requestId: string, action: DecisionAction) => {
    if (pendingKind !== null) return;
    setPendingKind(action.kind);
    setActionError(null);
    try {
      if (action.kind === "refer") {
        await onRefer(requestId);
        setOutcomes((prev) => ({ ...prev, [requestId]: "referred" }));
      } else if (action.kind === "pass") {
        await onPass(requestId, action.reason);
        setOutcomes((prev) => ({ ...prev, [requestId]: "declined" }));
        setPassTrayOpen(false);
      } else if (action.kind === "info" && onRequestInfo) {
        await onRequestInfo(requestId);
        setOutcomes((prev) => ({ ...prev, [requestId]: "asked" }));
      } else if (action.kind === "snooze" && onSnooze) {
        await onSnooze(requestId);
        setOutcomes((prev) => ({ ...prev, [requestId]: "snoozed" }));
      }
      advanceQueue(requestId);
    } catch (err) {
      setActionError(err instanceof Error && err.message ? err.message : "Action failed. Please try again.");
    } finally {
      setPendingKind(null);
    }
  };

  const menuItems = useMemo<readonly SplitActionMenuItem[]>(() => {
    const items: SplitActionMenuItem[] = [
      {
        id: "copy",
        label: "Copy Pitch",
        onSelect: () => {
          if (selectedRow) {
            navigator.clipboard.writeText(JSON.stringify(selectedRow.request.pitch));
            setNotice("Pitch copied to clipboard");
            setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
          }
        },
      },
    ];
    if (onRequestInfo) {
      items.push({
        id: "info",
        label: "Ask for Details",
        onSelect: () => {
          if (selectedRow) executeAction(selectedRow.request.id, { kind: "info" });
        },
      });
    }
    if (onSnooze) {
      items.push({
        id: "snooze",
        label: "Snooze 24h",
        onSelect: () => {
          if (selectedRow) executeAction(selectedRow.request.id, { kind: "snooze" });
        },
      });
    }
    return items;
  }, [selectedRow, onRequestInfo, onSnooze]);

  if (isLoading && requests.length === 0) {
    return <p className="text-ink-muted">Loading incoming requests...</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Incoming requests" className="space-y-4">
        <div>
          <h3 className="mb-2 text-label-ui text-ink-muted">Awaiting Decision ({awaitingRows.length})</h3>
          <ul className="space-y-2">
            {awaitingRows.map((r) => (
              <li key={r.request.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(r.request.id); setPassTrayOpen(false); }}
                  className={cx("w-full rounded-control border p-3 text-left transition-colors", r.request.id === selectedId ? "border-ink bg-surface-sunken" : "border-hairline bg-surface hover:bg-surface-hover")}
                >
                  <p className="text-body-primary font-semibold text-ink">{roleLabel(r.request)}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-label-ui text-ink-muted">{r.request.candidate.name}</span>
                    <StatusPill status={r.state.status} meta={r.state.meta} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <div className="rounded-card border border-hairline bg-surface p-6">
        {selectedRow ? (
          <div>
            <RequestDetail row={selectedRow} showHeading={true} />
            <div className="mt-8 border-t border-hairline pt-6">
              {passTrayOpen ? (
                <div className="mb-4">
                  <p className="mb-2 text-label-ui text-ink-muted">Why pass? One tap records feedback.</p>
                  <div className="flex flex-wrap gap-2">
                    {PASS_REASONS.map((reason) => (
                      <Chip key={reason.id} label={reason.label} onClick={() => executeAction(selectedRow.request.id, { kind: "pass", reason: reason.id })} />
                    ))}
                  </div>
                </div>
              ) : null}
              {actionError ? <p className="mb-3 text-label-ui text-red-600">{actionError}</p> : null}
              {notice ? <p className="mb-3 text-label-ui text-emerald-700">{notice}</p> : null}
              <div className="flex items-center gap-3">
                <SecondaryButton onClick={() => setPassTrayOpen((o) => !o)} disabled={pendingKind !== null} fullWidth>
                  {passTrayOpen ? "Cancel Pass" : "Pass"}
                </SecondaryButton>
                <SplitActionButton
                  label="✓ Refer Candidate"
                  onAction={() => executeAction(selectedRow.request.id, { kind: "refer" })}
                  menuItems={menuItems}
                  loading={pendingKind === "refer"}
                  loadingLabel="Referring…"
                  disabled={pendingKind !== null}
                  fullWidth
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-body-primary text-ink-muted">Select a request from the queue to review.</p>
        )}
      </div>
    </div>
  );
}

function RequestDetail({ row }: { row: QueueRowModel; showHeading: boolean }) {
  const { request, state } = row;
  const { candidate } = request;
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewId = useId();

  return (
    <article>
      <div className="flex items-center justify-between">
        <span className="type-mono-data text-ink-subtle">{request.jobReference}</span>
        <StatusPill status={state.status} meta={state.meta} />
      </div>
      <h2 className="mt-2 type-heading-section">{roleLabel(request)}</h2>
      <div className="mt-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-label-ui font-semibold text-ink">
          {initials(candidate.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-primary font-semibold text-ink">{candidate.name}</p>
          <p className="text-label-ui text-ink-muted">{candidate.headline}</p>
          {candidate.verifiedDomain ? <VerifiedBadge domain={candidate.verifiedDomain} className="mt-2" /> : null}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-sunken px-4 text-label-ui text-ink">
          <BriefcaseIcon className="size-4 text-ink-subtle" />
          {experienceLabel(candidate)}
        </span>
        {candidate.resumeUrl ? (
          <Chip label="Resume" leadingIcon={<FileIcon className="size-4" />} selected={previewOpen} onClick={() => setPreviewOpen((o) => !o)} />
        ) : null}
        {candidate.githubUrl ? (
          <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-surface px-4 text-label-ui text-ink-muted hover:bg-surface-hover hover:text-ink">
            GitHub <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
      </div>
      {previewOpen && candidate.resumeUrl ? (
        <div id={previewId} className="mt-3 overflow-hidden rounded-card border border-hairline">
          <iframe src={candidate.resumeUrl} title="Resume preview" className="block h-[400px] w-full bg-surface" />
        </div>
      ) : null}
      <div className="mt-6">
        <h3 className="text-label-ui text-ink-muted">Candidate Pitch</h3>
        <ol className="mt-2 space-y-2">
          {request.pitch.map((line, idx) => (
            <li key={idx} className="flex gap-3 text-body-primary text-ink-body">
              <span className="type-mono-data text-ink-subtle">{pad(idx + 1)}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function useSlaClock(_deadlines: readonly number[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default ReferrerCockpit;