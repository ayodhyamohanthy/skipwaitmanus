// Find a referral (design/goal-ui/pick/find-a-referral, content.json screenA).
// Directory: company rows + one chip toolbar, comp copy verbatim. Sort is
// alphabetical (content.json screenA.sort). A not-open company's alert CTA
// lives on its detail, never in list rows (content.json screenA.notOpenAction).
import { useMemo, useState } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalAvailability, GoalCompanyMark, GoalListRow } from "@/components/goal/GoalListRow";
import { GoalFilterChip } from "@/components/goal/GoalFilterChip";
import { GoalSearchInput } from "@/components/goal/GoalSearchInput";
import { GoalNum } from "@/components/goal/GoalNum";
import { exploreDescription, useCompanyDirectory } from "@/lib/companyDirectory";
import { publicRoute } from "@shared/publicRoutes";
import { applySeo } from "@/lib/seo";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { useEffect } from "react";

type ChipId = "all" | "open" | "engineering" | "product-design";
const CHIPS: { id: ChipId; label: string; matches?: string[] }[] = [
  { id: "all", label: "All companies" },
  { id: "open", label: "Open to requests" },
  { id: "engineering", label: "Engineering", matches: ["Engineering"] },
  { id: "product-design", label: "Product & design", matches: ["Product", "Design"] },
];

export default function Explore() {
  const directory = useCompanyDirectory();
  const [search, setSearch] = useState("");
  const [pressed, setPressed] = useState<ChipId[]>(["all"]);
  const companies = directory.data?.companies;
  const { isSlow } = useSlowLoad(!companies && !directory.isError);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const active = pressed.filter(id => id !== "all");
    return (companies ?? [])
      .filter(company => {
        if (query && !`${company.name} ${company.industry} ${company.functions.join(" ")}`.toLowerCase().includes(query)) return false;
        return active.every(id => {
          const chip = CHIPS.find(item => item.id === id);
          if (id === "open") return company.openToReferrals;
          return chip?.matches?.some(fn => company.functions.includes(fn)) ?? true;
        });
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, search, pressed]);
  const openShown = filtered.filter(company => company.openToReferrals).length;
  // Kit head (app/src/routes/explore.index.tsx pageMeta), names from the live directory.
  useEffect(() => { applySeo({ title: "Explore companies", description: exploreDescription(companies ?? []) ?? publicRoute("/explore")?.description, path: "/explore" }); }, [companies]);
  function toggle(id: ChipId, next: boolean) {
    if (id === "all") { setPressed(["all"]); return; }
    setPressed(current => {
      const active = current.filter(item => item !== "all");
      const updated = next ? [...active, id] : active.filter(item => item !== id);
      return updated.length ? updated : ["all"];
    });
  }
  return <main data-skipwait-screen="explore" className="w-full max-w-[696px] px-4 pt-6 pb-8 gdesk:px-8 gdesk:pt-10">
    <h1 className="text-g-display text-g-ink text-balance">Where do you want a referral?</h1>
    <p className="mt-2 text-g-body text-g-ink-2 text-pretty">Ask a verified employee. Your name and resume stay private until they accept.</p>
    <div className="mt-5 gdesk:mt-6">
      <GoalSearchInput label="Search companies" placeholder="Company, function or industry…" value={search} onChange={setSearch} />
    </div>
    <div className="mt-4 flex flex-wrap gap-x-2 gap-y-3 gdesk:gap-2" role="group" aria-label="Filter companies">
      {CHIPS.map(chip => <GoalFilterChip key={chip.id} label={chip.label} pressed={pressed.includes(chip.id)} onPressedChange={next => toggle(chip.id, next)} />)}
    </div>
    {companies ? <>
      <p data-testid="explore-summary" className="mt-6 gdesk:mt-7 text-g-meta text-g-ink-3">
        <GoalNum>{filtered.length}</GoalNum> {filtered.length === 1 ? "company" : "companies"} · <GoalNum>{openShown}</GoalNum> open to requests
      </p>
      {filtered.length ? <ul className="mt-2 -mx-2 grid gap-0.5" aria-live="polite">
        {filtered.map(company => <GoalListRow key={company.slug} density="company" href={`/explore/${company.slug}`}
          leading={<GoalCompanyMark initials={company.initials} />}
          title={company.name}
          meta={company.functions.join(" · ")}
          trailing={<GoalAvailability open={company.openToReferrals} label={company.openToReferrals ? "Open to requests" : "Not open yet"} />} />)}
      </ul> : <section className="mt-8 grid justify-items-start gap-3" aria-live="polite">
        <Building2 aria-hidden="true" className="size-6 text-g-ink-3" strokeWidth={1.75} />
        <h2 className="text-g-heading text-g-ink">No matching companies yet</h2>
        <p className="text-g-meta text-g-ink-3">Try a wider search.</p>
        <GoalButton variant="outline" onClick={() => { setSearch(""); setPressed(["all"]); }}>Clear filters</GoalButton>
      </section>}
      <p className="mt-4 text-g-meta text-g-ink-3">Availability can change. No referral is guaranteed.</p>
    </> : directory.isError ? <section className="mt-8 grid justify-items-start gap-3" role="alert">
      <Building2 aria-hidden="true" className="size-6 text-g-ink-3" strokeWidth={1.75} />
      <h2 className="text-g-heading text-g-ink">We couldn’t load companies.</h2>
      <GoalButton variant="outline" onClick={() => { void directory.refetch(); }} disabled={directory.isFetching}><RefreshCw aria-hidden="true" />Try again</GoalButton>
    </section>
      : <div aria-busy="true" aria-label="Loading companies"><ul className="mt-8 grid gap-0.5">
        {[0, 1, 2, 3].map(index => <li key={index} className="flex h-[52px] items-center gap-3 px-3"><span className="size-7 animate-pulse rounded-g-control bg-g-surface-selected" /><span className="h-4 w-40 animate-pulse rounded bg-g-surface-selected" /></li>)}
      </ul>{isSlow ? <p className="mt-3 text-g-meta text-g-ink-3">Taking longer than expected.</p> : null}</div>}
  </main>;
}
