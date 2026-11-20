// The goal frame for the employer surfaces (/employer, /employer/opportunities,
// later /employer/talent, /employer/billing, /for-companies via their own
// rows). Public entry pages that sit outside the goal app shell: brand link,
// the employer doors, an account slot and the page body. It fetches nothing
// itself. Sibling employer rows import this read-only (D-048-employer.md §3).
import type { ReactNode } from "react";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";

const DOORS = [
  { href: "/employer", label: "Overview" },
  { href: "/employer/opportunities", label: "Sponsor roles" },
] as const;

export function EmployerGoalFrame({ screen, page, current, account, children }: { screen: string; page: string; current?: "/employer" | "/employer/opportunities"; account?: ReactNode; children: ReactNode }) {
  return (
    <div data-skipwait-screen={screen} data-goal-page={page} className="g-scope min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 gdesk:px-5">
          <a href="/" aria-label="skipwait.me home" className="inline-flex shrink-0 items-center"><GoalBrandMark /></a>
          <nav aria-label="Employer" className="flex min-w-0 items-center gap-3 text-g-meta text-g-ink-2 gdesk:gap-4">
            {current
              ? DOORS.map(door => (
                <a key={door.href} href={door.href} aria-current={door.href === current ? "page" : undefined}
                  className={door.href === current ? "text-g-ink underline decoration-g-ink underline-offset-[6px]" : "hover:text-g-ink"}>
                  {door.label}
                </a>
              ))
              : null}
            {account}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-12 pt-6 gdesk:px-5 gdesk:pt-8">{children}</main>
    </div>
  );
}
