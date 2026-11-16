// The admin goal frame (D-048-p3-admin, D-048-admin.md §3): the internal
// operations header, the two queue doors and the page body at operational
// density. It fetches nothing itself. The other admin rows (admin-money,
// admin-people, admin-approvals, admin-ops) import this read-only.
import type { ReactNode } from "react";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";

export const ADMIN_DOORS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin-review", label: "Review queue" },
] as const;

export type AdminDoor = (typeof ADMIN_DOORS)[number]["href"];

export function AdminGoalFrame({ screen, current, children }: { screen: string; current?: AdminDoor; children: ReactNode }) {
  return (
    <div data-skipwait-screen={screen} data-goal-page="admin" className="g-scope min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 gdesk:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" aria-label="skipwait.me home" className="inline-flex shrink-0 items-center"><GoalBrandMark /></a>
            <span className="truncate text-g-meta text-g-ink-3 max-gdesk:hidden">Internal operations</span>
          </div>
          <nav aria-label="Admin" className="flex min-w-0 items-center gap-3 text-g-meta text-g-ink-2 gdesk:gap-4">
            {ADMIN_DOORS.map(door => (
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

/** The goal line block every admin goal page opens with (one h1). */
export function AdminGoalHeading({ goalLine, body }: { goalLine: string; body: string }) {
  return (
    <section className="mb-6">
      <p className="text-g-meta text-g-ink-3">Internal operations</p>
      <h1 className="mt-1 text-g-heading text-g-ink">{goalLine}</h1>
      <p className="mt-2 max-w-2xl text-g-meta text-g-ink-2">{body}</p>
    </section>
  );
}
