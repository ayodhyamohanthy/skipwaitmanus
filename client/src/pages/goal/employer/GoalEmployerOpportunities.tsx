// D-048-p3-employer: the goal /employer/opportunities (packet
// docs/plans/D-048-employer.md §3). Same endpoints and sponsorship flow as the
// kit page (client/src/pages/EmployerOpportunities.tsx): list, sponsor dialog,
// idempotency key, honest empty state. The tier costs come from the kit page's
// own table — this file never retypes a money line (§4.1); the goal dialog
// names what the money buys (a featured listing) and states the cost plainly
// without the internal unit word (rule 1a, D-153/D-173/D-180).
import { ArrowLeft, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { GoalButton, GoalEmptyState, GoalErrorState, GoalNextStep, GoalNum, GoalSkeletonRows } from "@/components/goal";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { EmployerGoalFrame } from "./EmployerGoalFrame";
import { SPONSOR_TIERS, type SponsorTier } from "./sponsorTiers";

export const GOAL_PAGE = { goalLine: "Sponsor a role." } as const;

type Opportunity = { id: number; companyDomain: string; kind: "hiring_now" | "walk_in"; roleTitle: string; location: string | null; isActive: boolean; sponsoredTier: "featured" | "spotlight" | null; sponsoredUntil: string | null; isSponsored: boolean };

export default function GoalEmployerOpportunities() {
  const [, go] = useLocation();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sponsorFor, setSponsorFor] = useState<Opportunity | null>(null);
  const [tier, setTier] = useState<SponsorTier["id"]>("featured");
  const [sponsoring, setSponsoring] = useState(false);
  const [sponsorAttemptKey, setSponsorAttemptKey] = useState("");

  useEffect(() => {
    applySeo({ title: "Sponsor a role on skipwait.me", description: "A featured listing is labeled as paid and sits in its own slot — never above employee posts, and never inside a referral request.", path: "/employer/opportunities" });
  }, []);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/employer/opportunities", { credentials: "include" });
      const payload = await readApiJson<{ opportunities?: Opportunity[]; error?: string }>(response, "We could not load your opportunities");
      if (!response.ok) throw new Error(payload.error || "We could not load your opportunities");
      setOpportunities(payload.opportunities || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load your opportunities"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const sponsor = async () => {
    if (!sponsorFor) return;
    setSponsoring(true);
    const idempotencyKey = sponsorAttemptKey || crypto.randomUUID();
    if (!sponsorAttemptKey) setSponsorAttemptKey(idempotencyKey);
    try {
      const response = await fetch(`/api/employer/opportunities/${sponsorFor.id}/sponsor`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ tier }) });
      const payload = await readApiJson<{ sponsorship?: { tier: SponsorTier["id"]; creditsSpent: number }; error?: string }>(response, "We could not sponsor this role");
      if (!response.ok) throw new Error(payload.error || "We could not sponsor this role");
      toast("Featured listing active.");
      setSponsorFor(null);
      setSponsorAttemptKey("");
      void load();
    } catch (sponsorError) { toast(sponsorError instanceof Error ? sponsorError.message : "We could not sponsor this role"); }
    finally { setSponsoring(false); }
  };

  const selectedTier = SPONSOR_TIERS.find(item => item.id === tier) ?? SPONSOR_TIERS[0];

  return (
    <EmployerGoalFrame screen="employer-opportunities" page="employer" current="/employer/opportunities">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex h-10 items-center justify-between">
          <GoalButton size="sm" variant="ghost" flush leadingIcon={ArrowLeft} onClick={() => go("/employer")}>Back to overview</GoalButton>
        </header>
        <section className="mt-4">
          <h1 className="text-g-heading text-g-ink">{GOAL_PAGE.goalLine}</h1>
          <p className="mt-2 text-g-meta text-g-ink-2">A featured listing is labeled as paid and sits in its own slot — never above employee posts, and never inside a referral request.</p>
        </section>
        {error ? (
          <GoalErrorState title="We could not load your opportunities" body={`${error} Nothing was changed. Check your connection and try again.`} retry={{ label: "Try again", onClick: () => void load() }} className="mt-5 px-0" />
        ) : loading ? (
          <div className="mt-5"><GoalSkeletonRows density="company" count={3} className="px-0" /></div>
        ) : !opportunities.length ? (
          <GoalEmptyState title="No opportunities yet." body="Verify a work email and post an opening first — sponsorship is one tap after that." className="mt-5 px-0" />
        ) : (
          <ul className="mt-5 grid gap-3 pb-8">
            {opportunities.map(opportunity => (
              <li key={opportunity.id} data-testid="goal-employer-opportunity" className="border border-g-hairline bg-g-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-g-label text-g-ink">{opportunity.roleTitle}</h2>
                    <p className="mt-1 truncate text-g-meta text-g-ink-3">{[opportunity.companyDomain, opportunity.location].filter(Boolean).join(" · ")}</p>
                  </div>
                  {opportunity.isSponsored ? <span className="inline-flex shrink-0 items-center gap-1 border border-g-hairline px-2.5 py-1 text-g-meta text-g-ink-2"><Sparkles aria-hidden="true" className="size-3.5" strokeWidth={1.75} />Featured listing</span> : null}
                </div>
                <GoalButton size="sm" touch="large" leadingIcon={Sparkles} className="mt-3 w-full" onClick={() => { setSponsorFor(opportunity); setTier(opportunity.sponsoredTier ?? "featured"); setSponsorAttemptKey(""); }}>
                  {opportunity.isSponsored ? "Extend sponsorship" : "Sponsor this role"}
                </GoalButton>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!sponsorFor && !loading && !error ? (
        <GoalNextStep reason={opportunities.length
          ? "Pick a role above; the cost is stated in the dialog before anything is deducted."
          : "Verify a work email and post an opening first — sponsorship is one tap after that."}>
          <GoalButton
            variant="primary"
            touch="large"
            className="w-full gdesk:w-auto"
            {...(opportunities.length ? { disabledReason: "Pick a role from the list first" } : { asChild: true })}
          >
            {opportunities.length ? "Sponsor this role" : <a href="/employer">Back to overview</a>}
          </GoalButton>
        </GoalNextStep>
      ) : null}
      {sponsorFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 gdesk:items-center">
          <div role="dialog" aria-modal="true" aria-label={`Sponsor ${sponsorFor.roleTitle}`} className="w-full max-w-md border border-g-hairline bg-g-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-g-label text-g-ink">Sponsor {sponsorFor.roleTitle}</h2>
                <p className="mt-1 text-g-meta text-g-ink-2">{sponsorFor.companyDomain}</p>
              </div>
              <GoalButton size="xs" variant="ghost" aria-label="Close sponsor dialog" leadingIcon={X} onClick={() => setSponsorFor(null)} className="!px-2" />
            </div>
            <div className="mt-4 grid gap-2">
              {SPONSOR_TIERS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={tier === item.id}
                  onClick={() => { setTier(item.id); setSponsorAttemptKey(""); }}
                  className={`border p-3.5 text-left ${tier === item.id ? "border-g-ink bg-g-surface-hover" : "border-g-hairline bg-g-surface"}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-g-label text-g-ink">{item.label} · {item.days} days</span>
                    <GoalNum>{item.cost}</GoalNum>
                  </span>
                </button>
              ))}
            </div>
            <GoalButton variant="primary" touch="large" busy={sponsoring} busyLabel={`Sponsoring ${sponsorFor.roleTitle}`} className="mt-4 w-full" onClick={() => void sponsor()}>Sponsor this role · {selectedTier.cost}</GoalButton>
            <p className="mt-2 text-center text-g-meta text-g-ink-3">The {selectedTier.days}-day listing is deducted from your promotion balance immediately and is always labeled as a paid placement.</p>
          </div>
        </div>
      )}
    </EmployerGoalFrame>
  );
}
