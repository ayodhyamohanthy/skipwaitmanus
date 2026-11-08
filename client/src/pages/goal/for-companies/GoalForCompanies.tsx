// The goal /for-companies page (D-048 phase 3, row D-048-p3-for-companies;
// packet docs/plans/D-048-employer.md). ForCompanies.tsx switches here when
// goalSurfaceOn("for-companies") is true.
//
// Rules this page keeps (packet §4):
// - Every price claim is sourced: plans and labels come from
//   components/employer/employerPlans.ts (read-only), never retyped. The
//   removed $199/mo programme (D-133) and the unbuilt Oct 25 company plans
//   are never sold or promised here.
// - Employer wording (§4 rule 1a, D-153/D-173/D-180): no "credit"/"credits"
//   and no noun "ask"/"asks". Employers never buy referrals (D-006, D-040);
//   the only paid placement is a labeled Featured listing.
// - D-040 fairness: no outcome promise. The company list makes no
//   availability claim (D-176): it names the listed companies only.
// - One black commit: the demo request, which opens an email to the team and
//   submits nothing silently (no demo backend exists yet).
import { ArrowRight, Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { GoalStaticFrame } from "@/components/goal/GoalStaticFrame";
import { GoalButton, GoalEmptyState, GoalErrorState, GoalField, GoalNextStep, GoalSkeletonRows } from "@/components/goal";
import { EMPLOYER_PLANS, employerPlanPriceLabel } from "@/components/employer/employerPlans";
import { useCompanyDirectory } from "@/lib/companyDirectory";
import { REFERRERS_NEVER_PAID } from "@shared/moneyCopy";

export const GOAL_PAGE = { goalLine: "Hire through people who know the work." } as const;

const TEAM_SIZES = ["1–200", "201–2,000", "2,000+"] as const;

/** The same prefilled demo email the kit page builds (pinned equal by the goal test). */
export function goalDemoMailto({ email, company, teamSize }: { email: string; company: string; teamSize: string }) {
  const name = company.trim();
  const subject = `Demo request${name ? ` — ${name}` : ""}`;
  const body = `Hi skipwait.me team,\n\nWe'd like a 20-minute demo for ${name || "our company"} (team size ${teamSize}).\n\nContact: ${email.trim()}\n\nThanks!`;
  return `mailto:hello@skipwait.me?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Claims the product backs today (carried from the kit page's reviewed copy).
const BENEFITS = [
  { title: "Referrals from people who know the work", text: "Employees choose who to refer. You get context, not cold applications." },
  { title: "Private by default", text: "Candidate names and resumes stay hidden until a verified employee accepts." },
  { title: "Your team stays in control", text: "Passing is private and always okay. Nobody is ranked or pressured." },
] as const;

const FAIR = [
  REFERRERS_NEVER_PAID,
  "Employers never buy referrals or a ranking of candidates.",
  "The only paid placement is a labeled Featured listing.",
  "Employees can decline without pressure.",
] as const;

const INPUT = "h-(--g-control-h) w-full border border-g-hairline bg-g-surface px-3 text-g-small text-g-ink";

function CompanyList() {
  const directory = useCompanyDirectory();
  return (
    <section aria-labelledby="goal-for-companies-list" className="border border-g-hairline bg-g-surface">
      <h2 id="goal-for-companies-list" className="px-5 pt-5 text-g-label text-g-ink max-gdesk:px-4">Companies on skipwait.me</h2>
      {directory.data ? (
        directory.data.companies.length ? (
          <ul className="flex flex-wrap gap-2 px-5 py-4 max-gdesk:px-4">
            {directory.data.companies.map(item => (
              <li key={item.slug} className="border border-g-hairline px-3 py-1.5 text-g-small text-g-ink">{item.name}</li>
            ))}
          </ul>
        ) : (
          <GoalEmptyState title="No companies are listed yet" body="Book a demo and we'll set up your company page with you." />
        )
      ) : directory.isError ? (
        <GoalErrorState title="We couldn't load the companies" body="Nothing else on this page depends on it." retry={{ label: "Try again", onClick: () => { void directory.refetch(); } }} />
      ) : (
        <GoalSkeletonRows density="queue" count={2} className="py-4" />
      )}
    </section>
  );
}

function Plans() {
  return (
    <section aria-labelledby="goal-for-companies-plans" className="grid gap-3">
      <h2 id="goal-for-companies-plans" className="text-g-label text-g-ink">Employer plans</h2>
      <div className="grid gap-3 gdesk:grid-cols-2">
        {EMPLOYER_PLANS.map(plan => (
          <article key={plan.id} className="border border-g-hairline bg-g-surface p-5">
            <h3 className="text-g-label text-g-ink">{plan.name}</h3>
            <p className="mt-1 font-g-mono text-g-heading text-g-ink">{employerPlanPriceLabel(plan.price)}</p>
            <p className="mt-2 text-g-meta text-g-ink-2">{plan.detail}</p>
          </article>
        ))}
      </div>
      <p className="text-g-meta text-g-ink-3">Every plan starts with a conversation; there is no self-serve checkout yet.</p>
    </section>
  );
}

function DemoRequest() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState<string>(TEAM_SIZES[0]);
  const claimOn = import.meta.env.VITE_COMPANY_CLAIM === "true";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.open(goalDemoMailto({ email, company, teamSize }), "_self");
  };
  return (
    <GoalNextStep reason="Book a 20-minute demo. This opens your email app addressed to our team; nothing is sent until you send it.">
      <form id="demo" onSubmit={submit} aria-label="Book a demo" className="mt-4 grid gap-3">
        <GoalField label="Work email" htmlFor="goal-for-companies-email">
          <input id="goal-for-companies-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" className={INPUT} />
        </GoalField>
        <GoalField label="Company" htmlFor="goal-for-companies-company">
          <input id="goal-for-companies-company" required value={company} onChange={event => setCompany(event.target.value)} placeholder="Company name" className={INPUT} />
        </GoalField>
        <GoalField label="Team size" htmlFor="goal-for-companies-size">
          <select id="goal-for-companies-size" value={teamSize} onChange={event => setTeamSize(event.target.value)} className={INPUT}>
            {TEAM_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </GoalField>
        <GoalButton type="submit" variant="primary" touch="large" className="w-full gdesk:w-auto">Request a demo <ArrowRight className="size-4" strokeWidth={1.75} /></GoalButton>
      </form>
      {claimOn ? (
        <p className="mt-3 text-g-meta text-g-ink-2">
          Already work there? <a href="/company/claim" className="font-medium text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Claim your company page</a>
        </p>
      ) : null}
    </GoalNextStep>
  );
}

export default function GoalForCompanies() {
  return (
    <div data-goal-page="for-companies">
      <GoalStaticFrame>
        <div className="grid gap-6">
          <section className="border border-g-hairline bg-g-surface p-5 gdesk:p-6">
            <p className="text-g-meta text-g-ink-3">For employers</p>
            <h1 className="mt-1 text-g-heading text-g-ink">{GOAL_PAGE.goalLine}</h1>
            <p className="mt-2 max-w-xl text-g-meta text-g-ink-2">Employees verify with their own work email and choose who to refer. You get referrals with context, and your team stays in control.</p>
          </section>
          <DemoRequest />
          <CompanyList />
          <section aria-labelledby="goal-for-companies-benefits" className="grid gap-3">
            <h2 id="goal-for-companies-benefits" className="text-g-label text-g-ink">What you get</h2>
            <div className="grid gap-3 gdesk:grid-cols-3">
              {BENEFITS.map(item => (
                <article key={item.title} className="border border-g-hairline bg-g-surface p-5">
                  <h3 className="text-g-label text-g-ink">{item.title}</h3>
                  <p className="mt-2 text-g-meta text-g-ink-2">{item.text}</p>
                </article>
              ))}
            </div>
          </section>
          <section aria-label="Fair hiring commitments" className="border border-g-hairline bg-g-surface p-5">
            <ul className="grid gap-2">
              {FAIR.map(text => (
                <li key={text} className="flex items-start gap-2 text-g-small text-g-ink"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-g-ink-2" strokeWidth={1.75} />{text}</li>
              ))}
            </ul>
          </section>
          <Plans />
        </div>
      </GoalStaticFrame>
    </div>
  );
}
