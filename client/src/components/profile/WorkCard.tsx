// Kit v4 /work card (app/src/routes/work.tsx `.work-card`) for one live work
// item. The title is the outbound link; in "My view" the thumbnail opens the
// edit sheet (edit and remove) and the tools row carries pin and visibility.
import { FileText, Globe, Lock, Pin } from "lucide-react";
import { Button } from "@/components/kit/button";
import { WORK_VISIBILITY_LABELS, workKindLabel, type WorkItem } from "./workItems";

export type WorkPatch = { readonly pinned?: boolean; readonly visibleOnProfile?: boolean };

export function WorkCard({ item, manage, busy, onPatch, onEdit }: {
  item: WorkItem;
  manage: boolean;
  busy: boolean;
  onPatch: (patch: WorkPatch) => void;
  onEdit: () => void;
}) {
  const VisIcon = item.visibleOnProfile ? Globe : Lock;
  return (
    <article className={`work-card ${item.pinned ? "pinned" : ""}`}>
      <div className="work-thumb">
        <FileText aria-hidden="true" />
        {item.pinned ? <span className="pin-flag"><Pin aria-hidden="true" />Pinned</span> : null}
        {manage ? <button type="button" className="absolute inset-0 cursor-pointer" aria-label={`Edit ${item.title}`} disabled={busy} onClick={onEdit} /> : null}
      </div>
      <div className="work-body">
        <span className="eyebrow">{workKindLabel(item.kind)}{item.source ? ` · from ${item.source}` : ""}</span>
        <h3>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{item.title}</a> : item.title}</h3>
        <span className="vis-chip"><VisIcon />{item.visibleOnProfile ? WORK_VISIBILITY_LABELS.visible : WORK_VISIBILITY_LABELS.hidden}</span>
      </div>
      {manage ? (
        <div className="work-tools">
          <Button variant="ghost" size="sm" disabled={busy} aria-pressed={item.pinned} onClick={() => onPatch({ pinned: !item.pinned })}><Pin />{item.pinned ? "Unpin" : "Pin"}</Button>
          <select aria-label="Who can see this" value={item.visibleOnProfile ? "visible" : "hidden"} disabled={busy} onChange={event => onPatch({ visibleOnProfile: event.target.value === "visible" })}>
            <option value="visible">{WORK_VISIBILITY_LABELS.visible}</option>
            <option value="hidden">{WORK_VISIBILITY_LABELS.hidden}</option>
          </select>
        </div>
      ) : null}
    </article>
  );
}
