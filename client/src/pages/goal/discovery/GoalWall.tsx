// D-048-p3-discovery: the goal /wall (packet docs/plans/D-048-marketing.md §3).
// Openings that verified employees shared for their own company. The commit is
// "Request a referral" on the chosen opening; the anonymity line stays; a paid
// placement stays labelled "Featured listing · paid placement" and partner
// tips stay labelled (D-040). Same endpoints and hand-off as the kit page,
// except the pay line: the goal UI shows no pay row (D-071, audit R6).
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ExternalLink } from "lucide-react";
import { GoalButton, GoalEmptyState, GoalErrorState, GoalListRow, GoalNextStep, GoalSkeletonRows, GoalVerifiedMark } from "@/components/goal";
import { readApiJson } from "@/lib/apiResponse";
import { readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { applySeo } from "@/lib/seo";
import { DiscoveryFrame } from "./DiscoveryFrame";
import { GoalShareActions, GoalZeroActivityShare } from "./GoalShareActions";

export const GOAL_PAGE = { goalLine: "See openings shared by verified employees." } as const;

type OpportunityPoster = { kind: "firstName"; firstName: string } | { kind: "anonymous" };
type Opportunity = { id: number; companyDomain: string; kind: "hiring_now" | "walk_in"; roleTitle: string; targetRoleUrl: string | null; location: string | null; walkInAt: string | null; walkInEndsAt: string | null; createdAt: string; isSponsored?: boolean; poster?: OpportunityPoster };
// The /api/partners row (same shape as the kit PartnerModuleCard reads; declared here so the page imports nothing from a kit file).
type PartnerModuleRow = { id: number; partnerName: string; headline: string; description: string | null; ctaLabel: string; ctaUrl: string };
type DirectoryCompany = { slug: string; name: string; domains: string[] };
type WallItem = { kind: "opportunity"; opportunity: Opportunity } | { kind: "partner"; module: PartnerModuleRow };

const LOAD_ERROR = "Internal openings are temporarily unavailable. Please try again.";
const FEATURED_LABEL = "Featured listing · paid placement";
const ORGANIC_LABEL = "Employee-shared opening";

function formatReassuranceBody(errorMessage: string, reassurance: string): string {
  const trimmed = errorMessage.trim();
  if (!trimmed) return reassurance;
  const punctuated = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return `${punctuated} ${reassurance}`;
}

function formatWalkIn(opportunity: Opportunity) {
  if (!opportunity.walkInAt) return "Walk-in details shared";
  const start = new Date(opportunity.walkInAt);
  const date = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (!opportunity.walkInEndsAt) return `${date} · ${time}`;
  const end = new Date(opportunity.walkInEndsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}–${end}`;
}

const placementLabel = (opportunity: Opportunity) => (opportunity.isSponsored ? FEATURED_LABEL : ORGANIC_LABEL);
const whenLabel = (opportunity: Opportunity) => (opportunity.kind === "walk_in" ? `Walk-in · ${formatWalkIn(opportunity)}` : "Hiring now");

function PartnerRow({ module }: { module: PartnerModuleRow }) {
  const trackClick = () => { void fetch(`/api/partners/${module.id}/click`, { method: "POST", credentials: "include" }).catch(() => undefined); };
  return (
    <li data-skipwait-screen="partner-module" className="rounded-g-tile border border-g-hairline px-3 py-3">
      <p className="text-g-meta text-g-ink-3">Partner tip · {module.partnerName}</p>
      <p className="mt-1 text-g-label text-g-ink">{module.headline}</p>
      {module.description ? <p className="mt-1 text-g-meta text-g-ink-2">{module.description}</p> : null}
      <a href={module.ctaUrl} target="_blank" rel="noopener noreferrer" onClick={trackClick} className="mt-2 inline-flex items-center gap-1.5 text-g-label text-g-ink underline underline-offset-[3px]">
        {module.ctaLabel}<ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      </a>
    </li>
  );
}

export default function GoalWall() {
  const [, go] = useLocation();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [partners, setPartners] = useState<PartnerModuleRow[]>([]);
  const [directory, setDirectory] = useState<DirectoryCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const retry = () => { setError(""); setLoading(true); setReloadKey(key => key + 1); };

  useEffect(() => {
    let active = true;
    void fetch("/api/opportunities", { credentials: "include" }).then(async response => {
      const payload = await readApiJson<{ opportunities?: Opportunity[]; error?: string }>(response, LOAD_ERROR);
      if (!response.ok) throw new Error(payload.error || "We could not load opportunities right now");
      if (active) setOpportunities(payload.opportunities || []);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : LOAD_ERROR); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);
  useEffect(() => {
    let active = true;
    void fetch("/api/partners", { credentials: "include" }).then(async response => {
      if (!response.ok) return;
      const payload = await readApiJson<{ modules?: PartnerModuleRow[] }>(response, "Partner recommendations are unavailable");
      if (active) setPartners(payload.modules || []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  // Company names for the verified line. Best effort: without it the domain shows.
  useEffect(() => {
    let active = true;
    void fetch("/api/companies").then(async response => {
      if (!response.ok) return;
      const payload = await response.json() as { companies?: DirectoryCompany[] };
      if (active && Array.isArray(payload.companies)) setDirectory(payload.companies);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  // /wall?opening=<id> deep links canonicalise to /wall (same SEO as the kit page).
  useEffect(() => { applySeo({ title: "Internal openings shared by verified employees", description: "Hiring-now roles and walk-in events published privately by verified employees, with the company domain and the role details.", path: "/wall" }); }, []);
  useEffect(() => {
    const openingId = Number(new URLSearchParams(window.location.search).get("opening"));
    if (opportunities.some(opportunity => opportunity.id === openingId)) setSelectedId(openingId);
  }, [opportunities]);
  useEffect(() => {
    if (selectedId == null) return;
    const timer = setTimeout(() => {
      const isDesktop = typeof window !== "undefined" && (typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 641px)").matches : (window.innerWidth ?? 0) >= 641);
      if (isDesktop) {
        const node = document.getElementById(`opening-${selectedId}`);
        if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest", behavior: "instant" });
      } else {
        const actionStep = document.getElementById("selected-opening-step");
        if (actionStep && typeof actionStep.scrollIntoView === "function") {
          actionStep.scrollIntoView({ block: "start", behavior: "instant" });
        }
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [opportunities, selectedId]);

  // Contextual partner slot, as on the kit page: after every third opening, one labelled partner tip.
  const items = useMemo(() => {
    const out: WallItem[] = [];
    opportunities.forEach((opportunity, index) => {
      out.push({ kind: "opportunity", opportunity });
      const slot = partners[(Math.floor(index / 3) - 1 + partners.length) % Math.max(1, partners.length)];
      if ((index + 1) % 3 === 0 && slot) out.push({ kind: "partner", module: slot });
    });
    return out;
  }, [opportunities, partners]);

  const selected = opportunities.find(opportunity => opportunity.id === selectedId) ?? opportunities[0];
  const companyOf = (domain: string) => directory.find(company => company.domains.includes(domain));

  const useOpportunity = (opportunity: Opportunity) => {
    if (!opportunity.targetRoleUrl) return;
    const draft = readReferralDraft();
    localStorage.setItem("bridge-target-url", opportunity.targetRoleUrl);
    // The goal UI carries no pay row (D-071; token audit R6), so no pay value rides into the draft.
    localStorage.removeItem("bridge-target-compensation");
    saveReferralDraft({ name: draft?.name || "", targetUrl: opportunity.targetRoleUrl });
    go("/start");
  };

  const intro = (
    <header className="max-w-2xl">
      <h1 className="text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-2 text-g-body text-g-ink-2">Employees who verified a work email share hiring signals for their own company. Each opening shows the company and the role; it never shows an employee name, a candidate name or a resume, unless the poster chose to show a first name.</p>
    </header>
  );

  const quietLinks = (
    <div className="mt-6 grid gap-1 text-g-meta text-g-ink-2">
      <p>Work here? <a href="/post-opportunity" className="text-g-ink underline underline-offset-[3px]">Share an opening you can refer for</a></p>
      <p>For employers: <a href="/employer" className="text-g-ink underline underline-offset-[3px]">sponsor roles</a>, always shown as a labelled featured listing.</p>
    </div>
  );

  let body;
  if (loading) {
    body = <GoalSkeletonRows density="ask" count={4} className="mt-6 px-0" />;
  } else if (error) {
    body = <GoalErrorState className="mt-6 px-0 max-gdesk:px-0" title="We couldn’t load openings" body={formatReassuranceBody(error, "Nothing was lost. Your saved roles and requests are unchanged.")} retry={{ label: "Try again", onClick: retry }} />;
  } else if (!selected) {
    body = (
      <div className="mt-6 max-w-2xl">
        <GoalEmptyState className="px-0 max-gdesk:px-0" title="No openings shared yet." body="Verified employees publish openings here as their companies hire. You can still request a referral with a job link you already have." />
        <div className="mt-4">
          <GoalNextStep reason="Paste the employer’s job link and send one referral request.">
            <div className="mt-4"><GoalButton variant="primary" onClick={() => go("/start")}>Request a referral</GoalButton></div>
          </GoalNextStep>
        </div>
        <GoalZeroActivityShare className="mt-6" />
        {quietLinks}
      </div>
    );
  } else {
    const company = companyOf(selected.companyDomain);
    const position = opportunities.findIndex(opportunity => opportunity.id === selected.id) + 1;
    body = (
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 gdesk:grid-cols-[minmax(0,1fr)_minmax(0,400px)] gdesk:items-start">
        <div id="selected-opening-step" className="order-first gdesk:order-2 gdesk:sticky gdesk:top-6">
          <GoalNextStep>
            <p className="mt-3 text-g-meta text-g-ink-3">{placementLabel(selected)} · {position} of {opportunities.length}</p>
            <h3 className="mt-1 text-g-heading text-g-ink">{selected.roleTitle}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-g-meta text-g-ink-2">
              <GoalVerifiedMark as="span" mutedText>Verified employee at</GoalVerifiedMark>
              {company ? <a href={`/explore/${company.slug}`} className="text-g-ink underline underline-offset-[3px]">{company.name}</a> : <span>{selected.companyDomain}</span>}
            </div>
            <p className="mt-2 text-g-meta text-g-ink-2">{selected.poster?.kind === "firstName" ? `Posted by ${selected.poster.firstName}` : "Identity hidden"}</p>
            <dl className="mt-3 grid gap-1 text-g-meta">
              <div className="flex gap-2"><dt className="text-g-ink-3">When</dt><dd className="text-g-ink">{whenLabel(selected)}</dd></div>
              {selected.location ? <div className="flex gap-2"><dt className="text-g-ink-3">Where</dt><dd className="text-g-ink">{selected.location}</dd></div> : null}
            </dl>
            <div className="mt-4">
              <GoalButton variant="primary" onClick={() => useOpportunity(selected)} disabledReason={selected.targetRoleUrl ? undefined : "No role link to send"}>Request a referral</GoalButton>
            </div>
            {selected.targetRoleUrl ? null : <p className="mt-2 text-g-meta text-g-ink-2">This walk-in has no role link yet. You can still attend with the shared details.</p>}
          </GoalNextStep>
          <section aria-label="Share this opening" className="mt-4">
            <p className="mb-2 text-g-meta text-g-ink-3">Share this opening</p>
            <GoalShareActions title={`${selected.roleTitle} at ${selected.companyDomain}`} message={`A verified employee shared a hiring signal for ${selected.roleTitle} at ${selected.companyDomain}. See if this opening is relevant to you:`} link={`${window.location.origin}/wall?opening=${selected.id}`} />
          </section>
          {quietLinks}
        </div>
        <ul aria-label="Openings" className="grid grid-cols-[minmax(0,1fr)] gap-1 gdesk:order-1">
          {items.map(item => item.kind === "partner"
            ? <PartnerRow key={`partner-${item.module.id}-${item.module.headline}`} module={item.module} />
            : <div key={item.opportunity.id} id={`opening-${item.opportunity.id}`} className="min-w-0">
                <GoalListRow density="ask" selected={item.opportunity.id === selected.id} onSelect={() => setSelectedId(item.opportunity.id)}
                  title={item.opportunity.roleTitle}
                  meta={`${placementLabel(item.opportunity)} · ${companyOf(item.opportunity.companyDomain)?.name ?? item.opportunity.companyDomain}`}
                  footer={[item.opportunity.location, whenLabel(item.opportunity)].filter(Boolean).join(" · ")} />
              </div>)}
        </ul>
      </div>
    );
  }

  return (
    <DiscoveryFrame screen="opportunity-wall" page="discovery-wall" current="/wall">
      {intro}
      {body}
    </DiscoveryFrame>
  );
}
