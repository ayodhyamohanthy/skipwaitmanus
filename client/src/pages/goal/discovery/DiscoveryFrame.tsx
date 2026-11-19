// The goal frame for the two public discovery pages (/wall, /jobs), which sit
// outside the app shell (App.tsx is not this row's file). Brand home link, the
// two sibling doors, an optional right-hand slot (the account menu or a sign-in
// on /jobs) and the page body. It fetches nothing itself.
import type { ReactNode } from "react";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";

const DOORS = [
  { href: "/explore", label: "Explore companies" },
  { href: "/jobs", label: "Roles" },
  { href: "/wall", label: "Openings" },
] as const;

export function DiscoveryFrame({ screen, page, current, account, children }: { screen: string; page: string; current: "/jobs" | "/wall"; account?: ReactNode; children: ReactNode }) {
  return (
    <div data-skipwait-screen={screen} data-goal-page={page} className="g-scope min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 gdesk:px-5">
          <a href="/" aria-label="skipwait.me home" className="inline-flex shrink-0 items-center"><GoalBrandMark /></a>
          <nav aria-label="Discover" className="flex min-w-0 items-center gap-3 text-g-meta text-g-ink-2 gdesk:gap-4">
            {DOORS.map(door => (
              <a key={door.href} href={door.href} aria-current={door.href === current ? "page" : undefined}
                className={door.href === current ? "text-g-ink underline decoration-g-ink underline-offset-[6px]" : door.href === "/explore" ? "max-gdesk:hidden hover:text-g-ink" : "hover:text-g-ink"}>
                {door.label}
              </a>
            ))}
            {account}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-12 pt-6 gdesk:px-5 gdesk:pt-8">{children}</main>
    </div>
  );
}
