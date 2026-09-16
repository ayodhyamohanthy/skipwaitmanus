import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Brand } from "@/components/Brand";

/**
 * Long-form disclosure shell shared by /terms, /refunds, and /support.
 *
 * These are reading pages, not guided flows, so they scroll normally
 * (`min-h-screen`) like /privacy. One hero card, numbered sections, and a
 * footer that cross-links the other policies so a reader never dead-ends.
 * The "Draft" pill stays until founder/legal review signs off (see
 * docs/pre-launch-checklist.md, P0 legal disclosures).
 */
export const SUPPORT_EMAIL = "support@skipwait.me";
export const policyLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy & trust" },
  { href: "/refunds", label: "Refunds & cancellation" },
  { href: "/support", label: "Support" },
] as const;

export function PolicySection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={`policy-${number}`} className="rounded-2xl border border-[#E2DDD2] bg-white p-5 shadow-sm sm:p-6">
    <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#191713]">{number}</p>
    <h2 id={`policy-${number}`} className="mt-1 text-base font-semibold text-[#191713]">{title}</h2>
    <div className="mt-3 space-y-3 text-sm leading-6 text-[#625D52] [&_li]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_strong]:text-[#2E2B25]">{children}</div>
  </section>;
}

export function PolicyPageShell({ screen, icon: Icon, eyebrow, title, intro, updated, status = "draft", children, footnote }: {
  screen: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  status?: "draft" | "published";
  children: ReactNode;
  footnote?: string;
}) {
  return <main data-skipwait-screen={screen} className="min-h-screen bg-[#F5F4EF] px-5 py-5 text-[#191713] sm:px-6 sm:py-8">
    <div className="mx-auto max-w-3xl">
      <header className="flex items-center justify-between gap-4"><Brand /><Link href="/" className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-[#625D52] hover:text-[#191713]"><ArrowLeft className="h-4 w-4" />Back</Link></header>
      <section className="mt-8 rounded-2xl border border-[#DBEAFE] bg-white p-6 shadow-sm sm:p-9">
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#E8F0FE] text-[#191713]"><Icon className="h-5 w-5" /></span>
          {status === "draft" ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-[#b45309]">Draft · pending legal review</span> : null}
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#191713]">{eyebrow}</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-.02em]">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#625D52]">{intro}</p>
        <p className="mt-4 text-xs font-semibold text-[#625D52]">Last updated {updated}</p>
      </section>
      <div className="mt-5 grid gap-3">{children}</div>
      <nav aria-label="Policies" className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold text-[#625D52]">
        {policyLinks.map(link => <Link key={link.href} href={link.href} className="hover:text-[#191713]">{link.label}</Link>)}
      </nav>
      {footnote ? <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-5 text-[#625D52]">{footnote}</p> : null}
    </div>
  </main>;
}
