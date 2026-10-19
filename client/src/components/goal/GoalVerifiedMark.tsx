// The ONLY user of g-trust in the tree (audit rule R2). Trust blue means
// "work email verified" and nothing else. Render only on a server verdict —
// the primitive never computes trust.
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function GoalVerifiedMark({ children, as: Comp = "p", className }: { children: string; as?: "p" | "span"; className?: string }) {
  return (
    <Comp data-testid="goal-verified-mark" className={cn("flex items-center gap-1.5 text-g-meta text-g-trust", className)}>
      <BadgeCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      {children}
    </Comp>
  );
}
