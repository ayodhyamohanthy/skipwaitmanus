import type { ReactNode } from "react";
import { ArrowLeft, Building2, ChartNoAxesCombined, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 administrator shell (app/src/components/admin-shell.tsx,
 * screens/web/36_admin__default.png).
 *
 * Distinct from the other nine admin consoles, which use the horizontal
 * AdminNav: the kit gives /admin its own dark sidebar because it is the
 * operations landing page rather than a single queue. Ported as designed,
 * with one removal — the kit's "DESIGN PREVIEW" badge, which the kit requires
 * be deleted once a screen is driven by real data.
 *
 * Colours are kit tokens: the sidebar is `bg-foreground text-background`,
 * which is exactly what the kit's `.admin-sidebar{background:var(--foreground)}`
 * compiles to, so it inverts correctly in dark mode.
 */

export type AdminView = "overview" | "companies" | "verifications" | "reports" | "users";

const ITEMS = [
  ["overview", "Overview", ChartNoAxesCombined],
  ["companies", "Companies", Building2],
  ["verifications", "Verifications", ShieldCheck],
  ["reports", "Safety reports", ShieldAlert],
  ["users", "Users", UsersRound],
] as const;

export function AdminConsoleShell({ view, onView, children }: { view: AdminView; onView: (view: AdminView) => void; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted lg:flex">
      <aside className="flex flex-col gap-6 bg-foreground p-5 text-background lg:fixed lg:inset-y-0 lg:left-0 lg:w-60">
        <span className="rounded border border-background/30 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-secondary">
          Internal operations
        </span>
        <Link href="/" className="text-2xl font-bold">
          SkipWait<span className="text-primary">.</span>
        </Link>
        <nav aria-label="Administrator views">
          <ul className="grid gap-1">
            {ITEMS.map(([id, label, Icon]) => {
              const active = view === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => onView(id)}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-sm font-semibold ${active ? "bg-primary text-primary-foreground" : "text-background/70 hover:text-background"}`}
                  >
                    <Icon className="size-4" aria-hidden="true" />{label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <Link href="/jobs" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-background/55 px-4 text-sm font-semibold">
          <ArrowLeft className="size-4" aria-hidden="true" />Exit admin
        </Link>
      </aside>
      <div className="min-w-0 flex-1 lg:ml-60">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-background px-5 py-4">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" />All decisions should be documented
          </span>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
