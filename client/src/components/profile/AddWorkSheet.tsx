// Kit v4 "Add work" sheet (app/src/routes/work.tsx `.work-sheet`) posting to
// the live work-items API. Kinds and visibility are the live enum/boolean.
import { ArrowRight, Globe, Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/kit/button";
import { WORK_KINDS, WORK_VISIBILITY_LABELS, type WorkKind } from "./workItems";

export type NewWorkItem = { title: string; kind: WorkKind; source: string | null; url: string | null; visibleOnProfile: boolean };

export function AddWorkSheet({ busy, error, onClose, onSubmit }: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (item: NewWorkItem) => void;
}) {
  const [kind, setKind] = useState<WorkKind>("project");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => onSubmit({ title: title.trim(), kind, source: source.trim() || null, url: url.trim() || null, visibleOnProfile: visible });
  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="app-dialog work-sheet" role="dialog" aria-modal="true" aria-label="Add work" onClick={event => event.stopPropagation()}>
        <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={onClose}><X /></Button>
        <span className="eyebrow">ADD TO YOUR PROFILE</span><h2>What did you make?</h2>
        <div className="chip-row" role="radiogroup" aria-label="Type">
          {WORK_KINDS.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? "selected" : ""} onClick={() => setKind(value)}>{label}</button>)}
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
        <Button className="brand-button" disabled={busy} onClick={submit}>{busy ? "Saving…" : visible ? "Publish to profile" : "Save privately"}<ArrowRight /></Button>
      </div>
    </div>
  );
}
