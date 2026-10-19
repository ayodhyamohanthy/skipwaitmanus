// Kit v4 work sheet (app/src/routes/work.tsx `.work-sheet`) over the live
// work-items API. Without `editing` it adds a piece; with it, the same sheet
// edits that piece and offers Remove. Kinds and visibility are the live
// enum/boolean.
import { ArrowRight, Globe, Lock, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/kit/button";
import { WORK_KINDS, WORK_VISIBILITY_LABELS, type WorkItem, type WorkKind } from "./workItems";

// Empty source/link go as "" (the API stores them as null; it rejects a null
// source), so a cleared field also clears the saved value on edit.
export type NewWorkItem = { title: string; kind: WorkKind; source: string; url: string; visibleOnProfile: boolean };

function asWorkKind(kind: string | undefined): WorkKind {
  return WORK_KINDS.find(([value]) => value === kind)?.[0] ?? "project";
}

export function AddWorkSheet({ busy, error, editing, onClose, onSubmit, onRemove }: {
  busy: boolean;
  error: string;
  editing?: WorkItem;
  onClose: () => void;
  onSubmit: (item: NewWorkItem) => void;
  onRemove?: () => void;
}) {
  const [kind, setKind] = useState<WorkKind>(asWorkKind(editing?.kind));
  const [title, setTitle] = useState(editing?.title ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [source, setSource] = useState(editing?.source ?? "");
  const [visible, setVisible] = useState(editing?.visibleOnProfile ?? true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => onSubmit({ title: title.trim(), kind, source: source.trim(), url: url.trim(), visibleOnProfile: visible });
  const label = editing ? "Edit work" : "Add work";
  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="app-dialog work-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={event => event.stopPropagation()}>
        <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={onClose}><X /></Button>
        <span className="eyebrow">{editing ? "ON YOUR PROFILE" : "ADD TO YOUR PROFILE"}</span><h2>{editing ? "Edit work" : "What did you make?"}</h2>
        <div className="chip-row" role="radiogroup" aria-label="Type">
          {WORK_KINDS.map(([value, kindLabel]) => <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "selected" : ""} onClick={() => setKind(value)}>{kindLabel}</button>)}
        </div>
        <label>Title<input autoFocus value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="e.g. Redesigned onboarding for a fintech app" /></label>
        <label>Link<input value={url} inputMode="url" onChange={event => setUrl(event.target.value)} placeholder="https://" /></label>
        <label>Source<input value={source} maxLength={80} onChange={event => setSource(event.target.value)} placeholder="Behance, GitHub, your site…" /></label>
        <fieldset className="vis-picker">
          <legend>Who can see this?</legend>
          <button type="button" aria-pressed={visible} className={visible ? "selected" : ""} onClick={() => setVisible(true)}><Globe />{WORK_VISIBILITY_LABELS.visible}</button>
          <button type="button" aria-pressed={!visible} className={!visible ? "selected" : ""} onClick={() => setVisible(false)}><Lock />{WORK_VISIBILITY_LABELS.hidden}</button>
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
        <Button className="brand-button" disabled={busy} onClick={submit}>{busy ? "Saving…" : editing ? "Save changes" : visible ? "Publish to profile" : "Save privately"}<ArrowRight /></Button>
        {editing && onRemove ? <Button variant="ghost" className="text-destructive" disabled={busy} onClick={onRemove}><Trash2 />Remove work</Button> : null}
      </div>
    </div>
  );
}
