import { ArrowRight, BadgeCheck, Check } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { LaunchCompany } from "@/lib/companies";

const STEP_LABELS = ["Company", "Work email", "Code", "Verified"] as const;

export function VerifyHeading() {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">REFERRER VERIFICATION</span>
        <h1>Prove you&apos;re inside<span className="brand-dot">.</span></h1>
        <p>A one-time code to your work email. Seekers see a &quot;Verified&quot; badge — never your email address.</p>
      </div>
    </div>
  );
}

export function VerifyProgress({ stepIndex }: { stepIndex: number }) {
  return (
    <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Verification progress">
      {STEP_LABELS.map((label, i) => (
        <li key={label} className="min-w-0" aria-current={i === stepIndex ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-muted"}`} />
          <span className={`mt-2 block truncate text-xs ${i === stepIndex ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Page frame shared by every state: heading, the step card, and the kit aside. */
export function VerifyLayout({ screen, company, busy, children }: { screen: string; company: LaunchCompany; busy?: boolean; children: ReactNode }) {
  return (
    <main data-skipwait-screen={screen} className="page-content" aria-busy={busy || undefined}>
      <VerifyHeading />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-8">{children}</section>
        <VerifyAside company={company} />
      </div>
    </main>
  );
}

export function VerifyAside({ company }: { company: LaunchCompany }) {
  return (
    <aside className="space-y-4">
      <div className="rounded-3xl bg-muted p-5"><span className="eyebrow">WHY A CODE?</span><p className="mt-2 text-sm">It proves you can receive email at {company.name} today. It doesn&apos;t prove your role or that {company.name} endorses SkipWait.</p></div>
      <div className="rounded-3xl border border-border p-5 text-sm">
        <span className="eyebrow">WE STORE</span>
        <ul className="mt-2 space-y-2">
          <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Your work email, kept private</li>
          <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Company and verification date</li>
          <li className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />Never the code or your inbox</li>
        </ul>
      </div>
      <div className="rounded-3xl border border-border p-5 text-sm"><span className="eyebrow">LEFT YOUR COMPANY?</span><p className="mt-2 text-muted-foreground">Pass on open requests so seekers get a kind note, then ask us through Help to remove your badge.</p></div>
    </aside>
  );
}

export function VerifiedPanel({ company }: { company: LaunchCompany }) {
  return (
    <div className="text-center">
      <span className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-accent"><BadgeCheck className="size-10 text-primary" /></span>
      <h2 className="text-2xl font-semibold">You&apos;re verified at {company.name}.</h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">Seekers now see a &quot;Verified at {company.name}&quot; badge. Your name and email stay hidden until you accept a request.</p>
      <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-border p-4 text-left">
        <span className="eyebrow">WHAT SEEKERS SEE</span>
        <div className="mt-3 flex items-center gap-3">
          <span className="company-mark">{company.initials}</span>
          <span><strong className="flex items-center gap-1">Someone at {company.name} <BadgeCheck className="size-4 text-primary" /></strong><small className="text-muted-foreground">Verified via work email</small></span>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Your badge stays on your account. Verify again here if your work email changes.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="outline" asChild><Link href="/profile">View my profile</Link></Button>
        <Button asChild><Link href="/referrer-setup">Set up referring <ArrowRight /></Link></Button>
      </div>
    </div>
  );
}
