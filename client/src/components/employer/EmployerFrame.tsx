import type { ReactNode } from "react";
import { ArrowLeft, BriefcaseBusiness, CreditCard, LayoutDashboard, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { AccountMenu } from "@/components/AccountMenu";
import { Button } from "@/components/kit/button";

// The live employer tools are separate routes, so the kit's view switcher
// becomes route navigation (kit Referrers/Domains/Settings have no backend).
export const EMPLOYER_VIEWS = [
  ["Overview", LayoutDashboard, "/employer"],
  ["Talent", UsersRound, "/employer/talent"],
  ["Roles", BriefcaseBusiness, "/employer/opportunities"],
  ["Billing", CreditCard, "/employer/billing"],
] as const;

export function EmployerFrame({ companyName, withNav, children }: { companyName?: string; withNav: boolean; children: ReactNode }) {
  return <div data-skipwait-screen="employer-dashboard" className="min-h-screen bg-muted">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
      <div className="flex min-w-0 items-center gap-3"><Link href="/" className="wordmark shrink-0">SkipWait<span className="brand-dot">.</span></Link><span className="min-w-0 truncate rounded-full bg-muted px-3 py-1 text-xs font-semibold">{companyName ? `EMPLOYER · ${companyName.toUpperCase()}` : "EMPLOYER"}</span></div>
      <div className="flex items-center gap-2"><Button variant="ghost" size="sm" asChild><Link href="/for-companies"><ArrowLeft />For companies</Link></Button><AccountMenu /></div>
    </header>
    <div className={`mx-auto grid max-w-6xl gap-4 p-5 ${withNav ? "md:grid-cols-[200px_minmax(0,1fr)]" : ""}`}>
      {withNav && <nav aria-label="Employer tools" className="flex gap-1 overflow-x-auto md:flex-col">{EMPLOYER_VIEWS.map(([label, Icon, href]) => {
        const current = href === "/employer";
        return <Link key={label} href={href} aria-current={current ? "page" : undefined} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm ${current ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}><Icon className="size-4" />{label}</Link>;
      })}</nav>}
      <main className="min-w-0 space-y-4">{children}</main>
    </div>
  </div>;
}

export function EmployerSkeleton() {
  return <div className="space-y-4" aria-busy="true" aria-label="Loading employer workspace">
    <div className="h-40 animate-pulse rounded-3xl bg-background" />
    <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map(key => <div key={key} className="h-24 animate-pulse rounded-3xl bg-background" />)}</div>
    <div className="h-56 animate-pulse rounded-3xl bg-background" />
  </div>;
}
