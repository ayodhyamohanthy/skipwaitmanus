// Goal-token building blocks shared by goal /profile and /work
// (D-048-p3-profile). Kit components stay out of this tree (goalBoundary
// reverse check), so the kit's ProfileLinkSheet, AddWorkSheet and WorkCard
// are mirrored here in behaviour, not styling: the same API bodies, the same
// limits and the same per-piece visibility words.
import * as Dialog from "@radix-ui/react-dialog";
import { CircleAlert, ExternalLink, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { GoalButton, GoalIconButton } from "@/components/goal";
import { WORK_KINDS, WORK_VISIBILITY_LABELS, workKindLabel, type WorkItem, type WorkKind } from "@/components/profile/workItems";
import type { ProfileVisibility } from "@/components/profile/VisibilityOptions";
import { readApiJson } from "@/lib/apiResponse";

export const GOAL_LINE = "Choose what referrers see.";
export const NETWORK_ERROR = "We could not reach skipwait.me. Check your connection and try again.";

export type ProfileRole = "seeker" | "referrer";
export type WorkPatch = { readonly pinned?: boolean; readonly visibleOnProfile?: boolean };
// Empty source/link go as "" (the API stores them as null; it rejects a null
// source), exactly as the kit sheet sends them.
export type NewWorkItem = { title: string; kind: WorkKind; source: string; url: string; visibleOnProfile: boolean };

/** fetch + JSON with the server's own error words, and plain words when the server is unreachable. */
export async function requestJson<T extends { error?: string }>(path: string, init: RequestInit, fallback: string): Promise<{ ok: true; payload: T }> {
  let response: Response;
  try { response = await fetch(path, init); } catch { throw new Error(NETWORK_ERROR); }
  const payload = response.status === 204 ? ({} as T) : await readApiJson<T>(response, fallback);
  if (!response.ok) throw new Error(payload.error || fallback);
  return { ok: true, payload };
}

/** The privacy summary row, from the saved page visibility (mirrors the kit PrivacyControls rule). */
export function discoverability(role: ProfileRole, visibility: ProfileVisibility): { title: string; hint: string } {
  if (visibility === "public") return { title: "Publicly discoverable", hint: "Anyone, and search engines, can see your public page." };
  if (role === "referrer") return { title: "Not publicly discoverable", hint: "Seekers see your company and function. Your name is shown only after you accept." };
  return { title: "Not publicly discoverable", hint: visibility === "link" ? "Only people with your link see your public page." : "Only referrers reviewing your referral request see context." };
}

export function GoalHeader({ line }: { line: string }) {
  return (
    <header className="max-w-[720px]">
      <h1 className="text-balance text-g-display text-g-ink">{GOAL_LINE}</h1>
      <p className="mt-3 max-w-[620px] text-g-body text-g-ink-2">{line}</p>
    </header>
  );
}

export function OfflineNotice() {
  return (
    <p data-testid="goal-offline-state" role="status" className="mt-4 flex items-center gap-2 text-g-meta text-g-ink-2">
      <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-ink" />
      You're offline. Changes can't be saved until you reconnect.
    </p>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="mt-6" aria-busy="true">
      <p role="status" className="text-g-meta text-g-ink-2">{label}</p>
      <div aria-hidden="true" className="mt-3 grid gap-2">
        <div className="h-14 rounded-g-tile bg-g-surface-hover" />
        <div className="h-14 rounded-g-tile bg-g-surface-hover" />
      </div>
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div role="alert" className="mt-6 border border-g-hairline p-4">
      <p className="flex items-start gap-2 text-g-label text-g-ink"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{message}</p>
      <p className="mt-1 text-g-meta text-g-ink-2">Nothing was changed. Try again in a moment.</p>
      <GoalButton className="mt-3" size="sm" variant="outline" onClick={onRetry}>Try again</GoalButton>
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-3 flex items-start gap-2 text-g-meta text-g-crimson"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{children}</p>;
}

const inputClass = "h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3 max-gdesk:h-12";

export function TextField({ id, label, help, ...rest }: { id: string; label: string; help?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-g-label text-g-ink">{label}</label>
      <input id={id} className={inputClass} {...rest} />
      {help ? <p className="text-g-meta text-g-ink-3">{help}</p> : null}
    </div>
  );
}

/** Phone: bottom sheet over a scrim. Desktop: a centred 480px panel. */
export function GoalDialog({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose(): void; children: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-g-fade-in fixed inset-0 z-40 bg-g-scrim motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className="g-scope animate-g-sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-[12px] bg-g-surface px-4 pt-3 pb-5 font-g-sans text-g-ink motion-reduce:animate-none gdesk:inset-x-auto gdesk:top-1/2 gdesk:bottom-auto gdesk:left-1/2 gdesk:w-[480px] gdesk:-translate-x-1/2 gdesk:-translate-y-1/2 gdesk:rounded-g-tile gdesk:p-6 gdesk:shadow-g-drawer"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {eyebrow ? <p className="text-g-meta text-g-ink-3">{eyebrow}</p> : null}
              <Dialog.Title className="text-g-heading text-g-ink">{title}</Dialog.Title>
            </div>
            <Dialog.Close asChild><GoalIconButton icon={X} aria-label="Close" /></Dialog.Close>
          </div>
          <div className="mt-4 grid gap-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The profile-link dialog: saves profiles.handle through the partial PUT; visibility stays on the public page. */
export function ProfileLinkDialog({ current, busy, error, offline, onClose, onSubmit }: { current: string | null; busy: boolean; error: string; offline: boolean; onClose(): void; onSubmit(handle: string): void }) {
  const [handle, setHandle] = useState(current ?? "");
  const blocked = offline ? "You're offline" : handle.trim() === "" ? "Type a link first" : undefined;
  return (
    <GoalDialog title={current ? "Change your profile link" : "Choose your profile link"} eyebrow="Your public page" onClose={onClose}>
      <div className="grid gap-2">
        <label htmlFor="goal-profile-link" className="text-g-label text-g-ink">Profile link</label>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-g-meta text-g-ink-2">skipwait.me/p/</span>
          <input id="goal-profile-link" autoFocus className={inputClass} value={handle} maxLength={40} onChange={event => setHandle(event.target.value)} placeholder="yourname" />
        </div>
        <p className="text-g-meta text-g-ink-3">3–40 lowercase letters, numbers, or dashes. Choose who can see the page on the page itself.</p>
      </div>
      {error ? <InlineError>{error}</InlineError> : null}
      <GoalButton variant="outline" touch="large" busy={busy} busyLabel="Saving…" disabledReason={blocked} onClick={() => onSubmit(handle.trim().toLowerCase())}>Save link</GoalButton>
    </GoalDialog>
  );
}

function VisibilityWords({ visible }: { visible: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-g-meta text-g-ink-2">
      <span aria-hidden="true" className={`size-(--g-dot) shrink-0 rounded-full ${visible ? "bg-g-ink" : "border-[1.5px] border-g-control-edge"}`} />
      {visible ? WORK_VISIBILITY_LABELS.visible : WORK_VISIBILITY_LABELS.hidden}
    </span>
  );
}

/** One work piece. In "My view" it carries pin, visibility and edit; the referrer view is read-only. */
export function WorkRow({ item, manage, busy, offline, onPatch, onEdit }: { item: WorkItem; manage: boolean; busy: boolean; offline: boolean; onPatch(patch: WorkPatch): void; onEdit(): void }) {
  const inert = busy || offline;
  return (
    <li data-testid="goal-work-row" className="grid gap-3 border-b border-g-hairline py-4 last:border-0 gdesk:grid-cols-[minmax(0,1fr)_auto] gdesk:items-center">
      <div className="min-w-0">
        <p className="text-g-meta text-g-ink-3">{workKindLabel(item.kind)}{item.source ? ` · from ${item.source}` : ""}{item.pinned ? " · Pinned" : ""}</p>
        <h3 className="mt-0.5 text-g-label text-g-ink">
          {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-[3px] hover:no-underline">{item.title}<ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.75} /></a> : item.title}
        </h3>
        <div className="mt-1"><VisibilityWords visible={item.visibleOnProfile} /></div>
      </div>
      {manage ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`goal-work-vis-${item.id}`}>{`Who can see ${item.title}`}</label>
          <select id={`goal-work-vis-${item.id}`} value={item.visibleOnProfile ? "visible" : "hidden"} disabled={inert}
            onChange={event => onPatch({ visibleOnProfile: event.target.value === "visible" })}
            className="h-11 rounded-g-control border border-g-control-edge bg-g-surface px-2 text-g-meta text-g-ink">
            <option value="visible">{WORK_VISIBILITY_LABELS.visible}</option>
            <option value="hidden">{WORK_VISIBILITY_LABELS.hidden}</option>
          </select>
          <GoalButton size="sm" variant="ghost" touch="large" aria-pressed={item.pinned} aria-label={`${item.pinned ? "Unpin" : "Pin"} ${item.title}`}
            disabledReason={offline ? "You're offline" : busy ? "Saving" : undefined} onClick={() => onPatch({ pinned: !item.pinned })}>{item.pinned ? "Unpin" : "Pin"}</GoalButton>
          <GoalButton size="sm" variant="ghost" touch="large" aria-label={`Edit ${item.title}`} disabledReason={busy ? "Saving" : undefined} onClick={onEdit}>Edit</GoalButton>
        </div>
      ) : null}
    </li>
  );
}

function asWorkKind(kind: string | undefined): WorkKind {
  return WORK_KINDS.find(([value]) => value === kind)?.[0] ?? "project";
}

/** Add or edit one piece (kit AddWorkSheet behaviour): same fields, same limits, Remove only when editing. */
export function WorkDialog({ editing, busy, error, offline, onClose, onSubmit, onRemove }: { editing?: WorkItem; busy: boolean; error: string; offline: boolean; onClose(): void; onSubmit(item: NewWorkItem): void; onRemove?(): void }) {
  const [kind, setKind] = useState<WorkKind>(asWorkKind(editing?.kind));
  const [title, setTitle] = useState(editing?.title ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [source, setSource] = useState(editing?.source ?? "");
  const [visible, setVisible] = useState(editing?.visibleOnProfile ?? true);
  const label = editing ? "Edit work" : "Add work";
  const offlineReason = offline ? "You're offline" : undefined;
  return (
    <GoalDialog title={label} eyebrow={editing ? "On your profile" : "Add to your profile"} onClose={onClose}>
      <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
        {WORK_KINDS.map(([value, kindLabel]) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}
            className={`min-h-11 rounded-g-control border px-3 text-g-meta ${kind === value ? "border-g-ink text-g-ink" : "border-g-control-edge text-g-ink-2"}`}>{kindLabel}</button>
        ))}
      </div>
      <TextField id="goal-work-title" label="Title" autoFocus value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="e.g. Redesigned onboarding for a fintech app" />
      <TextField id="goal-work-url" label="Link" value={url} inputMode="url" onChange={event => setUrl(event.target.value)} placeholder="https://" />
      <TextField id="goal-work-source" label="Source" value={source} maxLength={80} onChange={event => setSource(event.target.value)} placeholder="Behance, GitHub, your site…" />
      <div role="radiogroup" aria-label="Who can see this?" className="grid gap-2">
        <p className="text-g-label text-g-ink">Who can see this?</p>
        {([[true, WORK_VISIBILITY_LABELS.visible, "On your profile, for anyone who can see your page."], [false, WORK_VISIBILITY_LABELS.hidden, "Kept on your list; no referrer sees it."]] as const).map(([value, optionLabel, hint]) => (
          <button key={optionLabel} type="button" role="radio" aria-checked={visible === value} aria-label={optionLabel} onClick={() => setVisible(value)}
            className={`flex min-h-11 items-start gap-3 rounded-g-control border p-3 text-left ${visible === value ? "border-g-ink" : "border-g-control-edge"}`}>
            <span aria-hidden="true" className={`mt-1.5 size-(--g-dot) shrink-0 rounded-full ${visible === value ? "bg-g-ink" : "border-[1.5px] border-g-control-edge"}`} />
            <span><strong className="block text-g-label text-g-ink">{optionLabel}</strong><small className="block text-g-meta text-g-ink-3">{hint}</small></span>
          </button>
        ))}
      </div>
      {error ? <InlineError>{error}</InlineError> : null}
      <GoalButton variant="outline" touch="large" busy={busy} busyLabel="Saving…" disabledReason={offlineReason}
        onClick={() => onSubmit({ title: title.trim(), kind, source: source.trim(), url: url.trim(), visibleOnProfile: visible })}>
        {editing ? "Save changes" : visible ? "Publish to profile" : "Save privately"}
      </GoalButton>
      {editing && onRemove ? <GoalButton variant="ghost" touch="large" disabledReason={busy ? "Saving" : offlineReason} onClick={onRemove}>Remove work</GoalButton> : null}
    </GoalDialog>
  );
}
