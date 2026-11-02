// D-048-p3-employer: the goal /employer (packet docs/plans/D-048-employer.md).
// Same endpoints and states as the kit page (client/src/pages/EmployerDashboard.tsx):
// sign-in gate, account load, open-account form, signed-in overview. No
// employer price, credit, unlock or access rule changes (packet §4.1); display
// wording follows rule 1a (D-153/D-173/D-180): the copy names what the money
// buys (a talent unlock, a sponsored role) and never says "credit(s)" or the
// noun "ask"; shared money lines are imported, never retyped; D-040 fairness
// keeps outcome promises out. The data layer (employerData.ts) is read-only.
import { Sparkles, UsersRound, BarChart3, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalErrorState, GoalField, GoalNextStep, GoalNum, GoalSkeletonRows } from "@/components/goal";
import {
  activityStats,
  creditActivity,
  fetchEmployerAccount,
  fetchEmployerActivity,
  openEmployerAccount,
  isJustJoined,
  type EmployerAccount,
  type EmployerActivity,
} from "@/components/employer/employerData";
import { applySeo } from "@/lib/seo";
import { FREE_ASKS_CHIP, REFERRERS_NEVER_PAID } from "@shared/moneyCopy";
import { EmployerGoalFrame } from "./EmployerGoalFrame";

/** D-006/D-040 for employers: what a company can never buy, and the seeker money fact from the shared source. */
const REFERRALS_NOT_FOR_SALE = `Employers never buy referrals. Seekers get ${FREE_ASKS_CHIP} and use extra ones for more requests. ${REFERRERS_NEVER_PAID}`;

const ACCOUNT_KEY = ["employer", "account"] as const;
const ACTIVITY_KEY = ["employer", "activity"] as const;

export const GOAL_PAGE = { goalLine: "Hire without the noise." } as const;

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export default function GoalEmployer() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    // Public employer entry point: it keeps its own title instead of inheriting
    // whatever screen the visitor came from.
    applySeo({ title: "Hire on skipwait.me", description: `Sponsor roles to opt-in job seekers, unlock anonymized opt-in talent, and manage a self-serve promotion budget. ${REFERRALS_NOT_FOR_SALE}`, path: "/employer" });
  }, []);

  const accountQuery = useQuery({ queryKey: ACCOUNT_KEY, queryFn: fetchEmployerAccount, enabled: isLoaded && isSignedIn, retry: false });
  const account = accountQuery.data ?? null;
  const activityQuery = useQuery({ queryKey: ACTIVITY_KEY, queryFn: fetchEmployerActivity, enabled: Boolean(account), retry: false });
  const start = useMutation({
    mutationFn: () => openEmployerAccount(companyName),
    onSuccess: opened => { if (opened) { queryClient.setQueryData(ACCOUNT_KEY, opened); void queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY }); } },
  });

  if (!isLoaded) return <Frame><LoadingRows /></Frame>;
  if (!isSignedIn) return <Frame><SignInCard /></Frame>;
  if (accountQuery.isPending) return <Frame><LoadingRows /></Frame>;
  if (accountQuery.isError && !account) {
    return (
      <Frame>
        <GoalErrorState title="We could not load your employer account" body="Nothing was changed. Check your connection and try again." retry={{ label: "Try again", onClick: () => void accountQuery.refetch() }} />
      </Frame>
    );
  }
  if (!account) {
    return (
      <Frame>
        <OpenAccountCard
          companyName={companyName}
          onNameChange={setCompanyName}
          startError={start.isError ? errorText(start.error, "We could not open your employer account") : ""}
          starting={start.isPending}
          onStart={() => start.mutate()}
        />
      </Frame>
    );
  }
  return (
    <Frame account>
      {activityQuery.isPending
        ? <LoadingRows />
        : <GoalOverview account={account} activity={activityQuery.data} activityError={activityQuery.isError ? errorText(activityQuery.error, "We could not load your employer activity") : ""} onRetry={() => void activityQuery.refetch()} retrying={activityQuery.isFetching} />}
    </Frame>
  );
}

const Frame = ({ account, children }: { account?: boolean; children: React.ReactNode }) => (
  <EmployerGoalFrame screen="employer" page="employer" current={account ? "/employer" : undefined}>{children}</EmployerGoalFrame>
);

const LoadingRows = () => <div className="mt-6 grid gap-4"><GoalSkeletonRows density="queue" count={3} /></div>;

function SignInCard() {
  return (
    <section className="mx-auto mt-6 w-full max-w-xl border border-g-hairline bg-g-surface p-6 gdesk:p-8">
      <h1 className="text-g-heading text-g-ink">Hire without the noise.</h1>
      <p className="mt-2 text-g-meta text-g-ink-2">Sign in to sponsor roles, discover opt-in talent, and manage your promotion budget.</p>
      <SignInButton>
        <GoalButton variant="primary" touch="large" className="mt-6 w-full">Sign in to continue</GoalButton>
      </SignInButton>
    </section>
  );
}

function OpenAccountCard({ companyName, onNameChange, startError, starting, onStart }: { companyName: string; onNameChange: (value: string) => void; startError: string; starting: boolean; onStart: () => void }) {
  return (
    <section className="mx-auto mt-6 w-full max-w-xl border border-g-hairline bg-g-surface p-6 gdesk:p-8">
      <span className="grid size-12 place-items-center rounded border border-g-hairline bg-g-surface-hover"><Sparkles className="size-5 text-g-ink-2" strokeWidth={1.75} /></span>
      <h1 className="mt-5 text-g-heading text-g-ink">Become an employer on skipwait.me</h1>
      <p className="mt-2 text-g-meta text-g-ink-2">Sponsor your open roles as a clearly labeled featured listing and reach anonymized opt-in talent with your promotion budget. {REFERRALS_NOT_FOR_SALE}</p>
      <ul className="mt-4 grid gap-2 text-g-small">
        <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><UsersRound className="size-4 text-g-ink-2" strokeWidth={1.75} /></span>Talent discovery — only seekers who opted in, anonymized until their snapshot is unlocked</li>
        <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><BarChart3 className="size-4 text-g-ink-2" strokeWidth={1.75} /></span>Self-serve promotion budget — pay for talent unlocks and sponsored roles</li>
      </ul>
      <div className="mt-6">
        <GoalField label="Company name" htmlFor="goal-employer-company-name">
          <input
            id="goal-employer-company-name"
            data-testid="goal-employer-company-name"
            value={companyName}
            onChange={event => onNameChange(event.target.value)}
            placeholder="Acme Robotics"
            className="h-(--g-control-h) w-full border border-g-hairline bg-g-surface px-3 text-g-small text-g-ink"
          />
        </GoalField>
      </div>
      {startError ? <p role="alert" className="mt-3 border border-g-hairline bg-g-surface-hover p-3 text-g-small text-g-ink">{startError}</p> : null}
      <GoalButton variant="primary" touch="large" busy={starting} busyLabel="Opening your employer account" disabledReason={companyName.trim() ? undefined : "Add your company name first"} className="mt-5 w-full" onClick={onStart}>Get started</GoalButton>
    </section>
  );
}

const STEPS = [
  ["Top up for talent unlocks and sponsored roles", "/employer/billing"],
  ["Browse opt-in talent", "/employer/talent"],
  ["Sponsor a role (optional)", "/employer/opportunities"],
] as const;

function GoalOverview({ account, activity, activityError, onRetry, retrying }: { account: EmployerAccount; activity: EmployerActivity | undefined; activityError: string; onRetry: () => void; retrying: boolean }) {
  const fresh = isJustJoined(account, activity);
  const { liveRoles, sponsored } = activityStats(activity);
  return (
    <div className="grid gap-4">
      <section className="border border-g-hairline bg-g-surface p-5 gdesk:p-6">
        <p className="text-g-meta text-g-ink-3">{`${account.companyName.toUpperCase()} ON SKIPWAIT`}</p>
        <h1 className="mt-1 text-g-heading text-g-ink">{fresh ? "Welcome. Let's open your first doors." : "Your hiring, warmer."}</h1>
        <p className="mt-2 max-w-xl text-g-meta text-g-ink-2">Employees verify with their own work email and choose who to refer. You see opt-in talent and your own spend — never individual seekers' private requests.</p>
      </section>
      <div className="grid grid-cols-2 gap-3 gdesk:grid-cols-4">
        {([["Talent unlock balance", String(account.credits)], ["Monthly budget", `$${(account.budgetMonthlyUsdCents / 100).toFixed(0)}`], ["Live roles", liveRoles], ["Sponsored now", sponsored]] as const).map(([label, value]) => (
          <section key={label} className="border border-g-hairline bg-g-surface p-4 gdesk:p-5">
            <GoalNum className="text-g-heading">{value}</GoalNum>
            <p className="mt-1 text-g-meta text-g-ink-2">{label}</p>
          </section>
        ))}
      </div>
      {activityError ? (
        <GoalErrorState title="We could not load your employer activity" body="Nothing was changed. Check your connection and try again." retry={{ label: "Try again", onClick: onRetry }} />
      ) : activity?.access === "restricted" ? (
        <ApprovalNotice account={account} />
      ) : fresh ? (
        <GoalNextStep reason="Everything below opens once your employer application is approved.">
          <ol className="mt-3 grid gap-2">
            {STEPS.map(([title, href], index) => (
              <li key={title}>
                <a href={href} className="flex min-h-12 items-center gap-3 border border-g-hairline bg-g-surface px-3 text-left text-g-label text-g-ink">
                  <GoalNum>{index + 1}</GoalNum>
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </GoalNextStep>
      ) : activity ? (
        <GoalSpendActivity activity={activity} />
      ) : null}
    </div>
  );
}

function GoalSpendActivity({ activity }: { activity: Extract<EmployerActivity, { access: "open" }> }) {
  const { rows, truncated } = creditActivity(activity.spend, Date.now());
  const max = Math.max(...rows.map(row => row.value));
  const labels = ["Top-ups", "Spent on talent unlocks", "Spent on sponsored roles"] as const;
  return (
    <section className="border border-g-hairline bg-g-surface p-5 gdesk:p-6">
      <h2 className="text-g-label text-g-ink">Spend · last 30 days</h2>
      {max === 0 ? (
        <p className="mt-4 text-g-meta text-g-ink-2">No spend in the last 30 days.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((row, index) => (
            <div key={labels[index]}>
              <div className="flex justify-between text-g-small"><span className="text-g-ink">{labels[index]}</span><GoalNum>{row.value}</GoalNum></div>
              <div className="mt-1 h-2 bg-g-surface-hover"><span className="block h-full bg-g-ink" style={{ width: `${max ? (row.value / max) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-g-meta text-g-ink-3">{truncated ? `FROM YOUR LATEST ${activity.spend.length} LEDGER ENTRIES` : "FROM YOUR LEDGER"}</p>
    </section>
  );
}

function ApprovalNotice({ account }: { account: EmployerAccount }) {
  const status = account.approvalStatus;
  const title = status === "pending" ? "Your employer application is in review"
    : status === "rejected" ? "Your employer application was not approved"
    : status === "suspended" || status === "revoked" ? "Employer access is paused"
    : "Employer tools are not open for this account yet";
  return (
    <section className="flex items-start gap-3 border border-g-hairline bg-g-surface p-5 gdesk:p-6">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-g-ink-2" strokeWidth={1.75} />
      <div>
        <h2 className="text-g-label text-g-ink">{title}</h2>
        <p className="mt-2 text-g-meta text-g-ink-2">{account.decisionNote || "Talent discovery, sponsored roles and your spend record open once your employer application is approved."}</p>
      </div>
    </section>
  );
}
