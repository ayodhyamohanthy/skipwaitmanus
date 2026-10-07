import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

/**
 * skipwait.me stamp mark and wordmark (DESIGN.md, "Scoreboard" world).
 * `dark` renders the paper-on-ink variant used on the ink masthead and dark blocks.
 */
export function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" aria-label="skipwait.me home" className={`inline-flex min-h-11 items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#131311] ${dark ? "text-paper" : "text-ink"}`}><span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center border-[1.5px] ${dark ? "border-paper/50" : "border-ink"}`}><ArrowUpRight className="size-5" /></span><span className="font-display text-2xl uppercase tracking-[.01em]">skipwait.me</span></Link>;
}
