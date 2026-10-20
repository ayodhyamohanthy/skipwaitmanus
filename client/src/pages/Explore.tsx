// Find a referral — the goal-UI directory (D-048 phase 3; comp:
// design/goal-ui/pick/find-a-referral.html, approved D-071).
//
// This file is the directory column only. The frame around it — rail, top bar,
// one navigation, the ask drawer column — is the goal shell's job
// (agent/instinct/goal-ui-w0-shell), so nothing here draws chrome. Every
// figure comes from GET /api/companies; there is no commit action on this
// screen, so nothing in it is a black fill (DESIGN.md rule 1).
import { useEffect, useMemo, useState } from "react";
import { JOB_FUNCTIONS } from "@shared/jobFunctions";
import { publicRoute } from "@shared/publicRoutes";
import { GoalAvailability, GoalCompanyMark, GoalEmptyState, GoalErrorState, GoalFilterChip, GoalListRow, GoalNum, GoalSearchInput, GoalSkeletonRows } from "@/components/goal";
import { exploreDescription, useCompanyDirectory } from "@/lib/companyDirectory";
import { applySeo } from "@/lib/seo";

const ALL_COMPANIES = "All companies";
const OPEN_TO_REQUESTS = "Open to requests";

export default function Explore() {
  const directory = useCompanyDirectory();
  const [search, setSearch] = useState("");
  const [functionFilter, setFunctionFilter] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const companies = directory.data?.companies ?? [];

  useEffect(() => {
    applySeo({ title: "Find a referral", description: exploreDescription(companies) ?? publicRoute("/explore")?.description, path: "/explore" });
  }, [companies]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return companies.filter(company => {
      const matchesText = !query || `${company.name} ${company.industry} ${company.functions.join(" ")} ${company.location}`.toLowerCase().includes(query);
      const matchesFunction = !functionFilter || company.functions.includes(functionFilter);
      const matchesOpen = !openOnly || company.openToReferrals;
      return matchesText && matchesFunction && matchesOpen;
    });
  }, [companies, search, functionFilter, openOnly]);

  const filteredOpen = filtered.filter(company => company.openToReferrals).length;
  const anyFilter = Boolean(search.trim() || functionFilter || openOnly);
  function clear() { setSearch(""); setFunctionFilter(null); setOpenOnly(false); }

  let body;
  if (directory.isPending) {
    body = <GoalSkeletonRows density="company" count={5} className="mt-6" />;
  } else if (directory.isError) {
    body = (
      <GoalErrorState
        className="mt-6"
        title="We couldn’t load companies."
        body={directory.error.message}
        retry={{ label: "Try again", onClick: () => { void directory.refetch(); } }}
      />
    );
  } else if (!filtered.length) {
    body = anyFilter ? (
      <>
        <GoalEmptyState className="mt-6" title="No company matches that yet." body="Clear a filter, or tell us where you want a door to open next." action={{ label: "Clear filters", onClick: clear }} />
        <p className="px-5 text-g-meta"><a href="/invite" className="text-g-ink underline decoration-g-control-edge underline-offset-[3px]">Request a company</a></p>
      </>
    ) : (
      <GoalEmptyState className="mt-6" title="No companies yet." body="Tell us where you want a door to open next." action={{ label: "Request a company", href: "/invite" }} />
    );
  } else {
    body = (
      <>
        <p data-testid="goal-find-summary" className="mt-7 text-g-meta text-g-ink-3">
          <GoalNum>{filtered.length}</GoalNum> {filtered.length === 1 ? "company" : "companies"}
          <span className="px-1.5" aria-hidden="true">·</span>
          <GoalNum>{filteredOpen}</GoalNum> open to requests
        </p>
        <ul className="mt-2">
          {filtered.map(company => (
            <GoalListRow
              key={company.slug}
              href={`/explore/${company.slug}`}
              density="company"
              leading={<GoalCompanyMark initials={company.initials} />}
              title={company.name}
              meta={company.functions.join(" · ")}
              trailing={<GoalAvailability open={company.openToReferrals} label={company.openToReferrals ? OPEN_TO_REQUESTS : "Not open yet"} />}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <section data-skipwait-screen="explore" aria-labelledby="goal-find-heading" className="g-scope min-h-full bg-g-canvas px-8 py-10 max-gdesk:px-4 max-gdesk:py-6">
      <div className="w-full max-w-[632px]">
        <h1 id="goal-find-heading" className="text-g-display text-g-ink text-balance">Where do you want a referral?</h1>
        <p className="mt-2 text-g-body text-g-ink-2 text-pretty">Ask a verified employee. Your name and resume stay private until they accept.</p>
        <div className="mt-6">
          <GoalSearchInput label="Search companies" value={search} onChange={setSearch} placeholder="Company, function or industry…" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 max-gdesk:gap-y-3" role="group" aria-label="Filter companies">
          <GoalFilterChip label={ALL_COMPANIES} pressed={!functionFilter && !openOnly} onPressedChange={() => clear()} />
          <GoalFilterChip label={OPEN_TO_REQUESTS} pressed={openOnly} onPressedChange={setOpenOnly} />
          {JOB_FUNCTIONS.map(name => (
            <GoalFilterChip key={name} label={name} pressed={functionFilter === name} onPressedChange={pressed => setFunctionFilter(pressed ? name : null)} />
          ))}
        </div>
        {body}
        <p className="mt-4 text-g-meta text-g-ink-3">Availability can change. No referral is guaranteed.</p>
      </div>
    </section>
  );
}
