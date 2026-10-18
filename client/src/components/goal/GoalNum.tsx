import type { HTMLAttributes } from "react";
import { gcn } from "./gcn";

/** A figure the product counts or computes (credits, counts, IDs, clocks, positions, dates): JetBrains Mono 500 at
 * 13px at most, whatever the line around it (DESIGN.md rule 4). */
export function GoalNum({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={gcn("g-num", className)} {...props} />;
}
