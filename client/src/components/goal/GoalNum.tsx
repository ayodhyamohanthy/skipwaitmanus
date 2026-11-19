// Mono numeral (port of shell.css .mono): JetBrains Mono 500, tabular, never
// wraps. Style lives in the .g-num class (index.css) so the 13px cap applies.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Status hues stay goal-internal (audit R3): screens ask for tone="warn",
 * the primitive names the amber. */
export function GoalNum({ children, className, tone }: { children: ReactNode; className?: string; tone?: "warn" }) {
  return <span data-testid="goal-num" className={cn("g-num", tone === "warn" && "text-g-amber", className)}>{children}</span>;
}
