import { BadgeCheck } from "lucide-react";
import { gcn } from "./gcn";

/** The only trust-blue element (DESIGN.md rule 2): lucide badge-check plus its text. The parent renders it only when
 * the server verdict says verified; this primitive never decides trust. */
export function GoalVerifiedMark({ children, as = "p", className }: { children: string; as?: "p" | "span"; className?: string }) {
  const Tag = as;
  return (
    <Tag data-testid="goal-verified-mark" className={gcn(as === "p" ? "flex" : "inline-flex", "items-center gap-1.5 text-g-meta text-g-trust", className)}>
      <BadgeCheck aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </Tag>
  );
}
