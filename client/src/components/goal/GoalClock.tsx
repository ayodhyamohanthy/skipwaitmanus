// Day-level clock (DESIGN.md rules 5 and 14): a mono figure, amber at two days or
// fewer and ink-3 otherwise. This is the one place a clock's colour is decided,
// so screens never reach for a status hue themselves. The label is already a
// day-level sentence ("2 days left"); nothing here computes or formats dates.
import { cn } from "@/lib/utils";
import { GoalNum } from "./GoalNum";

export function GoalClock({ label, urgent = false, className }: { label: string; urgent?: boolean; className?: string }) {
  return <GoalNum className={cn(urgent ? "text-g-amber" : "text-g-ink-3", className)}>{label}</GoalNum>;
}
