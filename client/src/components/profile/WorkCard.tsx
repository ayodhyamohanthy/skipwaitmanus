// Kit v4 /work card (app/src/routes/work.tsx `.work-card`) for one live work
// item. Management tools (pin, visibility, delete) render only in "My view".
import { ArrowRight, FileText, Globe, Lock, Pin, Trash2 } from "lucide-react";
import { Button } from "@/components/kit/button";
import { WORK_VISIBILITY_LABELS, workKindLabel, type WorkItem } from "./workItems";

export type WorkPatch = { readonly pinned?: boolean; readonly visibleOnProfile?: boolean };

export function WorkCard({ item, manage, busy, onPatch, onRemove }: {
  item: WorkItem;
  manage: boolean;
  busy: boolean;
  onPatch: (patch: WorkPatch) => void;
  onRemove: () => void;
}) {
  const VisIcon = item.visibleOnProfile ? Globe : Lock;
  return (
    <article className={`work-card ${item.pinned ? "pinned" : ""}`}>
      <div className="work-thumb h-auto!" aria-hidden="true"><FileText />{item.pinned ? <span className="pin-flag"><Pin />Pinned</span> : null}</div>
      <div className="work-body">
        <span className="eyebrow">{workKindLabel(item.kind)}{item.source ? ` · from ${item.source}` : ""}</span>
        <h3>{item.title}</h3>
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-link">Open link <ArrowRight className="size-3" /></a> : null}
        <span className="vis-chip"><VisIcon />{item.visibleOnProfile ? WORK_VISIBILITY_LABELS.visible : WORK_VISIBILITY_LABELS.hidden}</span>
      </div>
      {manage ? (
        <div className="work-tools">
          <Button variant="ghost" size="sm" disabled={busy} aria-pressed={item.pinned} onClick={() => onPatch({ pinned: !item.pinned })}><Pin />{item.pinned ? "Unpin" : "Pin"}</Button>
          <select aria-label="Who can see this" value={item.visibleOnProfile ? "visible" : "hidden"} disabled={busy} onChange={event => onPatch({ visibleOnProfile: event.target.value === "visible" })}>
            <option value="visible">{WORK_VISIBILITY_LABELS.visible}</option>
            <option value="hidden">{WORK_VISIBILITY_LABELS.hidden}</option>
          </select>
          <Button variant="ghost" size="icon" disabled={busy} aria-label={`Delete ${item.title}`} onClick={onRemove} className="text-destructive"><Trash2 /></Button>
        </div>
      ) : null}
    </article>
  );
}
