// The ONLY user of g-trust in the tree (audit rule R2). Trust blue means
// "work email verified" and nothing else. Render only on a server verdict —
// the primitive never computes trust.
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function GoalVerifiedMark({ children, as: Comp = "p", className, mutedText = false }: { children: string; as?: "p" | "span"; className?: string; mutedText?: boolean }) {
  return (
    <Comp data-testid="goal-verified-mark" className={cn("flex items-center gap-1.5 text-g-meta", mutedText ? "text-g-ink-2" : "text-g-trust", className)}>
      <BadgeCheck aria-hidden="true" className={cn("size-4 shrink-0", mutedText && "text-g-trust")} strokeWidth={1.75} />
      {children}
    </Comp>
  );
}
