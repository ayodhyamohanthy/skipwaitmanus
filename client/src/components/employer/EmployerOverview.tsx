import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { activityStats, creditActivity, isJustJoined, type EmployerAccount, type EmployerActivity } from "./employerData";

const STEPS = [
  ["Buy unlock credits", "/employer/billing"],
  ["Browse opt-in talent", "/employer/talent"],
  ["Sponsor a role (optional)", "/employer/opportunities"],
] as const;

type Props = { account: EmployerAccount; activity: EmployerActivity | undefined; activityError: string; onRetry: () => void; retrying: boolean };

export function EmployerOverview({ account, activity, activityError, onRetry, retrying }: Props) {
  const fresh = isJustJoined(account, activity);
  const { liveRoles, sponsored } = activityStats(activity);
  const stats = [["Unlock credits", String(account.credits)], ["Monthly budget", `$${(account.budgetMonthlyUsdCents / 100).toFixed(0)}`], ["Live roles", liveRoles], ["Sponsored now", sponsored]] as const;
  return <>
    <section className="rounded-3xl bg-background p-6"><span className="eyebrow">{`${account.companyName.toUpperCase()} ON SKIPWAIT`}</span><h1 className="mt-1 text-3xl font-semibold">{fresh ? "Welcome. Let's open your first doors." : "Your hiring, warmer."}</h1><p className="mt-2 max-w-xl text-muted-foreground">Employees verify with their own work email and choose who to refer. You see opt-in talent and your own spend — never individual seekers' private asks.</p></section>
    <div className="grid gap-3 sm:grid-cols-4">{stats.map(([label, value]) => <section key={label} className="rounded-3xl bg-background p-5"><strong className="text-3xl">{value}</strong><p className="text-sm text-muted-foreground">{label}</p></section>)}</div>
    {activityError ? <ActivityError message={activityError} onRetry={onRetry} retrying={retrying} />
      : activity?.access === "restricted" ? <ApprovalNotice account={account} />
      : fresh ? <section className="rounded-3xl bg-background p-6"><h2 className="font-semibold">Get started</h2><ol className="mt-3 space-y-3">{STEPS.map(([title, href], index) => <li key={title}><Link href={href} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border p-3 text-left"><span className="grid size-7 place-items-center rounded-full bg-muted text-sm">{index + 1}</span>{title}</Link></li>)}</ol></section>
      : activity ? <CreditActivity activity={activity} /> : null}
  </>;
}

function CreditActivity({ activity }: { activity: Extract<EmployerActivity, { access: "open" }> }) {
  const { rows, truncated } = creditActivity(activity.spend, Date.now());
  const max = Math.max(...rows.map(row => row.value));
  return <section className="rounded-3xl bg-background p-6"><h2 className="font-semibold">Credit activity · last 30 days</h2>
    {max === 0 ? <p className="mt-4 text-sm text-muted-foreground">No credit activity in the last 30 days.</p>
      : <div className="mt-4 space-y-3">{rows.map(row => <div key={row.label}><div className="flex justify-between text-sm"><span>{row.label}</span><span>{row.value}</span></div><div className="mt-1 h-2 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} /></div></div>)}</div>}
    <p className="mt-4 text-xs text-muted-foreground">{truncated ? `FROM YOUR LATEST ${activity.spend.length} LEDGER ENTRIES` : "FROM YOUR CREDIT LEDGER"}</p>
  </section>;
}

function ApprovalNotice({ account }: { account: EmployerAccount }) {
  const status = account.approvalStatus;
  const title = status === "pending" ? "Your employer application is in review"
    : status === "rejected" ? "Your employer application was not approved"
    : status === "suspended" || status === "revoked" ? "Employer access is paused"
    : "Employer tools are not open for this account yet";
  return <section className="rounded-3xl bg-background p-6"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{account.decisionNote || "Talent discovery, sponsored roles and the credit ledger open once your employer application is approved."}</p></section>;
}

function ActivityError({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return <section role="alert" className="rounded-3xl bg-background p-6"><h2 className="font-semibold">We could not load your employer activity</h2><p className="mt-2 text-sm text-muted-foreground">{message === "We could not load your employer activity" ? "Nothing was changed. Check your connection and try again." : `${message}. Nothing was changed.`}</p><Button variant="outline" className="mt-4" disabled={retrying} onClick={onRetry}>Try again</Button></section>;
}
