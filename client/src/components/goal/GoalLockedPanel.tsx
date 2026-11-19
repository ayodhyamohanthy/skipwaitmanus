// GoalLockedPanel (referral-queue.css §91-98): a document COUNT only — never
// file names, links, a photo, a name or a plan (BRIEF.md §106).
import { FileText, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoalNum } from "./GoalNum";

export function GoalLockedPanel({ title, documentCount, className }: { title: string; documentCount: number; className?: string }) {
  return (
    <div data-testid="goal-locked-panel" className={cn("flex items-center gap-3 rounded-g-tile border border-g-hairline bg-g-surface-sunken px-4 py-3.5", className)}>
      <Lock aria-hidden="true" className="size-5 shrink-0 text-g-ink-2" strokeWidth={1.75} />
      <span className="text-g-label text-g-ink">{title}</span>
      <span className="ml-auto inline-flex items-center gap-1.5 text-g-ink-3">
        <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <GoalNum>{documentCount}</GoalNum>
        <span className="text-g-meta">{documentCount === 1 ? "document" : "documents"}</span>
      </span>
    </div>
  );
}
