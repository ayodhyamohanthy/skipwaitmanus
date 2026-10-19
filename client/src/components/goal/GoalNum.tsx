// Mono numeral (port of shell.css .mono): JetBrains Mono 500, tabular, never
// wraps. Style lives in the .g-num class (index.css) so the 13px cap applies.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GoalNum({ children, className }: { children: ReactNode; className?: string }) {
  return <span data-testid="goal-num" className={cn("g-num", className)}>{children}</span>;
}
