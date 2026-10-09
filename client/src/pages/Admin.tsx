import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, CircleDollarSign, Clock3, Eye, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { AdminConsoleShell, type AdminView } from "@/components/AdminConsoleShell";

/**
 * Kit v4 `/admin` (screens/web/36_admin__default.png, app/src/routes/admin.tsx).
 *
 * Ported to the kit's design — dark sidebar, five views, the priority-queue
 * panel and the monetization guardrails — with the kit's preview scaffolding
 * removed and replaced by real state, which the kit itself requires ("drive
 * those states from real data and remove the chips and banners").
 *
 * TWO THINGS DELIBERATELY NOT CARRIED OVER:
 *
 * 1. "Live data not connected" / "No fabricated count" KPI placeholders. They
 *    existed because the preview had no backend. A KPI either has a real
 *    number or links to the console that owns it; it never shows a dash.
 * 2. The bar chart ("SAMPLE REPORTING STRUCTURE ... ILLUSTRATIVE · NOT LIVE").
 *    Bars for "Qualified seeker demand" and "Available referral supply" would
 *    be invented activity, which the kit's first product rule forbids. It
 *    returns when a real growth series exists.
 *
 * The kit's five views map onto consoles that already exist, so this page
 * routes to them rather than reimplementing them.
 */

/** The kit's declared launch companies (START_HERE.md). There is no live
 *  `companies` table yet, so this is the kit's stated set, not a live count. */
const LAUNCH_COMPANIES = ["SkipWait", "Wipro", "Go Neutrinos", "TCS", "Merkle"] as const;

type SafetyReport = { id: number; reference: string; reason: string; urgent: boolean; status: string; dueAt: string; overdue: boolean };

const REASON_LABELS: Record<string, string> = {
  money_request: "Asked for or offered money",
  harassment: "Harassment or inappropriate messages",
  fake_job: "Fake job or scam",
  impersonation: "Pretending to work at a company",
  spam: "Spam or repeated asks",
  other: "Something else",
};

function Heading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

export default function Admin() {
  const [view, setView] = useState<AdminView>("overview");
  const [reports, setReports] = useState<SafetyReport[] | null>(null);
  const [reportsError, setReportsError] = useState("");

  const loadReports = useCallback(async () => {
    setReportsError("");
    try {
      const response = await fetch("/api/admin/safety-reports", { credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "We could not load the safety queue");
      setReports(Array.isArray(payload.reports) ? payload.reports : []);
    } catch (failure) {
      setReports(null);
      setReportsError(failure instanceof Error ? failure.message : "We could not load the safety queue");
    }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const openReports = reports?.filter(report => report.status === "received" || report.status === "in_review") ?? [];
  const overdue = openReports.filter(report => report.overdue);

  return (
    <AdminConsoleShell view={view} onView={setView}>
      {view === "overview" && (
        <>
          <Heading eyebrow="Marketplace control room" title="Operate for trust, not vanity." body="Prioritize safety, healthy supply, and useful introductions. Never optimize for referral volume alone." />
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={ShieldCheck} label="Verification queue" value={null} href="/admin/approvals" action="Open approvals" />
            <Kpi icon={ShieldAlert} label="Open reports" value={reportsError ? null : openReports.length} href={null} action={reportsError ? "Unavailable" : overdue.length ? `${overdue.length} past SLA` : "Within SLA"} />
            <Kpi icon={Building2} label="Launch companies" value={LAUNCH_COMPANIES.length} href={null} action="Declared by kit v4" />
            <Kpi icon={UsersRound} label="Marketplace users" value={null} href="/admin/users" action="Open users" />
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border border-border bg-background p-5">
              <p className="eyebrow text-muted-foreground">Operations</p>
              <h2 className="mt-1 text-lg font-semibold">Priority queues</h2>
              <ul className="mt-3">
                {[
                  ["Review company submissions", "Validate domains and prevent duplicates", "/admin/approvals"],
                  ["Review work-email exceptions", "Resolve only with sufficient evidence", "/admin/approvals"],
                  ["Handle safety reports", "Urgent harm and payment requests first", "/admin/approvals"],
                ].map(([title, body, href]) => (
                  <li key={title}>
                    <Link href={href} className="flex min-h-16 items-center justify-between gap-3 border-b border-border py-3 last:border-0">
                      <span className="min-w-0">
                        <strong className="block text-sm font-semibold">{title}</strong>
                        <small className="text-muted-foreground">{body}</small>
                      </span>
                      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border-2 border-foreground bg-secondary p-5">
              <p className="eyebrow">Sustainable, not pay-to-win</p>
              <h2 className="mt-1 text-lg font-semibold">Monetization guardrails</h2>
              <ul className="mt-3 grid gap-3">
                {[
                  [CircleDollarSign, "Employer subscriptions", "Hiring-team workflow and aggregate insights."],
                  [Eye, "Promoted employer profiles", "Clearly labeled, never prioritized in referral matching."],
                  [CheckCircle2, "Referrals remain free", "No commissions or paid queue position."],
                ].map(([Icon, title, body]) => {
                  const Glyph = Icon as typeof CircleDollarSign;
                  return (
                    <li key={title as string} className="flex gap-3">
                      <Glyph className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                      <span>
                        <strong className="block text-sm font-semibold">{title as string}</strong>
                        <small className="text-muted-foreground">{body as string}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </>
      )}

      {view === "companies" && (
        <>
          <Heading eyebrow="Company operations" title="Launch directory." body="The companies kit v4 declares as having people open to referrals. There is no live companies table yet, so this list is the kit's stated set rather than a queried directory." />
          <ul className="mt-6 grid gap-2">
            {LAUNCH_COMPANIES.map(name => (
              <li key={name} className="flex items-center gap-3 rounded-lg border border-border bg-background p-4">
                <Building2 className="size-5 text-primary" aria-hidden="true" />
                <strong className="text-sm font-semibold">{name}</strong>
              </li>
            ))}
          </ul>
        </>
      )}

      {view === "verifications" && (
        <>
          <Heading eyebrow="Trust operations" title="Verification review." body="Work-email checks confirm address ownership only. Exceptions require a documented decision and are reviewed in the shared approvals queue." />
          <div className="mt-6 rounded-lg border border-dashed border-border bg-background p-8 text-center">
            <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold">Approvals owns this queue.</h2>
            <p className="mt-1 text-sm text-muted-foreground">Referrer enrolments, seeker requests and credit-pack payments are triaged together, with evidence and an audit trail.</p>
            <Link href="/admin/approvals" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Open approvals <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </>
      )}

      {view === "reports" && (
        <>
          <Heading eyebrow="Safety operations" title="Reports and escalations." body="Payment requests, harassment, impersonation and spam, ordered newest first. A reviewer note is required on every decision and the 14-day appeal window opens on review." />
          {reportsError ? (
            <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <span>{reportsError}</span>
              <button type="button" onClick={() => void loadReports()} className="min-h-11 rounded-lg border border-destructive/30 bg-background px-4 text-xs font-bold text-destructive">Try again</button>
            </div>
          ) : reports === null ? (
            <p className="mt-6 text-sm text-muted-foreground">Loading the safety queue…</p>
          ) : openReports.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-background p-8 text-center">
              <CheckCircle2 className="mx-auto size-8 text-primary" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">Queue clear.</h2>
              <p className="mt-1 text-sm text-muted-foreground">No open reports. Resolved reports leave this queue.</p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-2">
              {openReports.map(report => (
                <li key={report.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm font-semibold">{report.reference}</strong>
                    <span className="flex items-center gap-2">
                      {report.urgent && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive"><ShieldAlert className="size-3" aria-hidden="true" />Unsafe</span>}
                      {report.overdue && <span className="inline-flex items-center gap-1 rounded-full bg-[#b45309]/10 px-2.5 py-1 text-[11px] font-bold text-[#b45309]"><Clock3 className="size-3" aria-hidden="true" />Past SLA</span>}
                      <span className="text-[11px] font-semibold text-muted-foreground">{report.status === "in_review" ? "In review" : "Received"}</span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{REASON_LABELS[report.reason] ?? report.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Due {new Date(report.dueAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === "users" && (
        <>
          <Heading eyebrow="Account operations" title="User lookup." body="Search and account review live in the users console, which separates profile, roles, verification, restrictions and audit history." />
          <div className="mt-6 rounded-lg border border-dashed border-border bg-background p-8 text-center">
            <UsersRound className="mx-auto size-8 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold">Users owns this view.</h2>
            <p className="mt-1 text-sm text-muted-foreground">Account lookup, suspension and audit history are on the users console.</p>
            <Link href="/admin/users" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Open users <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><BadgeCheck className="size-4 text-primary" aria-hidden="true" />Every action on that console is written to the activity log.</p>
        </>
      )}
    </AdminConsoleShell>
  );
}

function Kpi({ icon: Icon, label, value, href, action }: { icon: typeof ShieldCheck; label: string; value: number | null; href: string | null; action: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <Icon className="size-5 text-primary" aria-hidden="true" />
      </div>
      {value !== null
        ? <strong className="mt-3 block text-3xl font-semibold">{value}</strong>
        : <strong className="mt-3 block text-3xl font-semibold text-muted-foreground">—</strong>}
      {href
        ? <Link href={href} className="text-link mt-2 inline-flex min-h-9 items-center text-xs font-semibold">{action}</Link>
        : <small className="mt-2 block text-xs text-muted-foreground">{action}</small>}
    </div>
  );
}
