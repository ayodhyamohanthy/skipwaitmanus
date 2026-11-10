// The money-ops goal frame (D-048-p3-admin-money, D-048-admin.md §3). It
// fetches nothing itself and never changes a money action: the three pages
// below own their own state and their exact server calls. The admin goal frame
// (pages/goal/admin) is read-only for this row, so this is its money-ops twin.
import type { ReactNode } from "react";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { MONEY_DOORS, MONEY_GOAL_LINE, MONEY_PAGE_BODY, type MoneyDoor } from "./adminMoneyCopy";

export function AdminMoneyGoalFrame({ screen, current, children }: { screen: string; current: MoneyDoor; children: ReactNode }) {
  return (
    <div data-skipwait-screen={screen} data-goal-page="admin-money" className="g-scope min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        {/* Three long door labels need a second row on a phone (gdesk keeps the one-row bar). */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 gdesk:h-14 gdesk:flex-nowrap gdesk:gap-y-0 gdesk:py-0 gdesk:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" aria-label="skipwait.me home" className="inline-flex shrink-0 items-center"><GoalBrandMark /></a>
            <span className="truncate text-g-meta text-g-ink-3 max-gdesk:hidden">Internal operations · money</span>
          </div>
          <nav aria-label="Money operations" className="flex min-w-0 items-center gap-3 text-g-meta text-g-ink-2 gdesk:gap-4">
            {MONEY_DOORS.map(door => (
              <a key={door.href} href={door.href} aria-current={door.href === current ? "page" : undefined}
                className={door.href === current ? "text-g-ink underline decoration-g-ink underline-offset-[6px]" : "hover:text-g-ink"}>
                {door.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 gdesk:px-5 gdesk:pt-8">{children}</main>
    </div>
  );
}

/** Every money-ops goal page opens with the same one goal line (one h1). */
export function AdminMoneyHeading({ current }: { current: MoneyDoor }) {
  return (
    <section className="mb-6">
      <p className="text-g-meta text-g-ink-3">Internal operations · money</p>
      <h1 className="mt-1 text-g-heading text-g-ink">{MONEY_GOAL_LINE}</h1>
      <p className="mt-2 max-w-2xl text-g-meta text-g-ink-2">{MONEY_PAGE_BODY[current]}</p>
    </section>
  );
}
