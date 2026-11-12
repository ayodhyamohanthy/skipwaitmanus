// Find a referral (D-048 phase 3; approved comp design/goal-ui/pick/find-a-referral.*):
// the company directory with search and filter chips, and the ask drawer
// (desktop: docked 480px column, no scrim; phone: full-height sheet). Every
// number comes from GET /api/companies, /api/credits/summary and the live send
// response; D-176: availability never appears in the directory - it only routes the sent ask.
// The composer machinery is useAskComposer, shared with the company page.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import {
  GoalAppShell,
  GoalCompanyRow,
  GoalEmptyState,
  GoalErrorState,
  GoalFilterChip,
  GoalNum,
  GoalSearchInput,
  GoalSkeletonRows,
} from "@/components/goal";
import { exploreDescription, useCompanyDirectory } from "@/lib/companyDirectory";
import { CompanyDemandList } from "@/components/demand/CompanyDemandList";
import { trackClarityEvent } from "@/lib/clarity";
import { applySeo } from "@/lib/seo";
import { publicRoute } from "@shared/publicRoutes";
import { AskDrawer } from "./explore/AskDrawer";
import { directorySummary, filterCompanies, FILTER_FUNCTIONS } from "./explore/findModel";
import { useAskComposer } from "./explore/useAskComposer";
import { COMPANY_TYPEAHEAD_ENABLED, useCompanySearch, type CompanySearchState } from "./explore/useCompanySearch";

export default function Explore() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const directory = useCompanyDirectory();
  const companies = directory.data?.companies;

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => new URLSearchParams(search).get("company"));
  const [drawerOpen, setDrawerOpen] = useState(() => Boolean(new URLSearchParams(search).get("company")));
  const closeTimer = useRef<number | null>(null);
  // The company the form was written for. Reopening the same company keeps the
  // draft; picking another one starts empty instead of carrying its link and reasons.
  const formCompany = useRef<string | null>(selectedSlug);
  // Pre-filter from the landing search bar (QA fix, #407, kept in this wave): /explore?q=...
  const [query, setQuery] = useState(() => new URLSearchParams(search).get("q") ?? "");
  const [fn, setFn] = useState<(typeof FILTER_FUNCTIONS)[number] | null>(null);

  const company = selectedSlug ? companies?.find(item => item.slug === selectedSlug) ?? null : null;
  const composer = useAskComposer(company);
  const shown = useMemo(() => filterCompanies(companies ?? [], { query, fn }), [companies, query, fn]);
  const summary = directorySummary(shown);
  // D-174-seeker-journey-build.search: off until the release row; off sends nothing.
  const typeahead = COMPANY_TYPEAHEAD_ENABLED;
  const companySearch = useCompanySearch(query, typeahead);
  // The server suggests by company name; the directory filter also matches function and industry.
  // "Unlisted" needs both: an answered search with no company and no directory row for the query.
  // Whether the company exists is a question about the query alone: the active
  // function chip only narrows what the directory shows, so it never makes a company unlisted.
  const queryMatched = useMemo(() => filterCompanies(companies ?? [], { query, fn: null }).length > 0, [companies, query]);
  const noMatch = typeahead && Boolean(companies) && companySearch.status === "ready" && companySearch.noMatch && !queryMatched;
  // No empty-directory claim while the search is in flight, failed, or suggested a company the filter misses.
  // When the query does match rows the chip hides, the filter empty state is the truthful line and stays.
  // Invalid input speaks for itself (the typeahead's invalid line), so the directory never claims the company is missing.
  const searchSpeaks = typeahead && (companySearch.status === "invalid" || (!queryMatched && (companySearch.status === "loading" || companySearch.status === "error" || (companySearch.status === "ready" && companySearch.suggestions.length > 0))));

  useEffect(() => { applySeo({ title: "Find a referral", description: exploreDescription(companies ?? []) ?? publicRoute("/explore")?.description, path: "/explore" }); }, [companies]);

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  useEffect(() => () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); }, []);
  const selectCompany = (slug: string) => {
    clearCloseTimer();
    if (formCompany.current !== slug) {
      formCompany.current = slug;
      composer.resetForm();
    }
    setSelectedSlug(slug);
    setDrawerOpen(true);
    navigate(`/explore?company=${encodeURIComponent(slug)}`, { replace: true });
  };
  // Radix keeps the closing content mounted for its 200 ms exit (D-077(1)); the
  // company clears after it, while the route changes at once so the URL stays honest.
  const dismissDrawer = (after: () => void) => {
    setDrawerOpen(false);
    clearCloseTimer();
    after();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setSelectedSlug(null);
      composer.clearAfterClose();
    }, 200);
  };
  const closeDrawer = (open: boolean) => {
    if (open || !selectedSlug) return;
    dismissDrawer(() => navigate("/explore", { replace: true }));
  };

  const another = () => {
    dismissDrawer(() => {
      composer.resetForm({ clearResume: true });
      navigate("/explore", { replace: true });
    });
  };

  const clearFilters = () => { setQuery(""); setFn(null); };

  let directoryBody: ReactNode;
  if (directory.isError) {
    directoryBody = <GoalErrorState className="px-0" title="We couldn’t load companies." body="Check your connection and try again." retry={{ label: "Try again", onClick: () => { void directory.refetch(); } }} />;
  } else if (!companies) {
    directoryBody = <div className="mt-6"><GoalSkeletonRows density="company" count={6} className="px-0" /></div>;
  } else if (shown.length === 0 && searchSpeaks) {
    directoryBody = null;
  } else if (shown.length === 0) {
    directoryBody = (
      <div>
        <GoalEmptyState className="px-0" title="No matching companies yet" body="Try a wider search. If your company is missing, request it and we’ll open the door." action={{ label: "Clear filters", onClick: clearFilters }} />
        {noMatch ? null : <p className="text-g-meta"><Link href="/invite" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Request a company</Link></p>}
      </div>
    );
  } else {
    directoryBody = (
      <>
        <p data-testid="goal-directory-summary" className="mt-7 text-g-meta text-g-ink-3 max-gdesk:mt-6">
          <GoalNum className="text-g-ink-2">{summary.total}</GoalNum> {summary.total === 1 ? "company" : "companies"}
        </p>
        <ul aria-label="Companies" className="-mx-2 mt-2 grid max-gdesk:mx-0">
          {shown.map(item => (
            <GoalCompanyRow
              key={item.slug}
              testId={`goal-company-${item.slug}`}
              name={item.name}
              initials={item.initials}
              functions={item.functions}
              selected={company?.slug === item.slug}
              href={`/explore/${item.slug}`}
              onSelect={() => selectCompany(item.slug)}
            />
          ))}
        </ul>
        <p className="mt-4 text-g-meta text-g-ink-3">No referral is guaranteed.</p>
      </>
    );
  }

  return (
    <GoalAppShell
      active="find"
      pageTitle="Find a referral"
      drawer={company ? (
        <AskDrawer
          open={drawerOpen}
          onOpenChange={closeDrawer}
          company={company}
          context={composer.sent ? null : composer.context}
          signedIn={composer.signedIn}
          url={composer.url}
          onUrlChange={composer.onUrlChange}
          onUrlBlur={composer.onUrlBlur}
          hint={composer.hint}
          resume={composer.resumeView}
          onPickResume={composer.pickResume}
          resumeError={composer.resumeError}
          reasons={composer.reasons}
          onReasonChange={composer.onReasonChange}
          reasonsError={composer.reasonsError}
          work={composer.work}
          watch={composer.watch}
          cost={composer.cost}
          topUp={composer.topUp}
          onTopUp={composer.onTopUp}
          sendLabel={composer.sendLabel}
          sendBusyLabel={composer.sendBusyLabel}
          sending={composer.sending}
          sendBlocked={composer.sendBlocked}
          sendGuidance={composer.sendGuidance}
          creditRecovery={composer.creditRecovery}
          onSend={composer.send}
          onSaveDraft={composer.onSaveDraft}
          draftState={composer.draftState}
          error={composer.sendError}
          sent={composer.sent}
          onAnother={another}
        />
      ) : undefined}
    >
      <div data-skipwait-screen="find-a-referral" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6 max-gdesk:pb-6">
        <h1 className="text-balance text-g-display text-g-ink">Where do you want a referral?</h1>
        <p className="mt-2 text-pretty text-g-body text-g-ink-2">Ask a verified employee. Your name and resume stay private until they accept.</p>
        <div className="mt-6 max-gdesk:mt-5">
          {typeahead ? (
            <CompanyTypeahead value={query} onChange={setQuery} search={companySearch} unlisted={noMatch} onOpen={slug => navigate(`/explore/${slug}`)} />
          ) : (
            <GoalSearchInput label="Search companies" placeholder="Company, function or industry…" value={query} onChange={setQuery} />
          )}
        </div>
        <div role="group" aria-label="Filter companies" className="mt-4 flex flex-wrap gap-2 max-gdesk:gap-y-3">
          <GoalFilterChip label="All companies" pressed={fn === null} onPressedChange={() => { setFn(null); }} />
          {FILTER_FUNCTIONS.map(item => (
            <GoalFilterChip key={item} label={item} pressed={fn === item} onPressedChange={pressed => setFn(pressed ? item : null)} />
          ))}
        </div>
        {directoryBody}
        {/* D-086.mount: the browse state only (empty search); renders nothing while the switch is off. */}
        {!query.trim() && !fn ? <div className="mt-10"><CompanyDemandList /></div> : null}
      </div>
    </GoalAppShell>
  );
}

// Invalid input, by cause: the shared schema's 80-character limit, or a 400 the route gave for a query
// the schema accepts (cause unknown, so this line does not claim length). Neither offers a retry.
const INVALID_TOO_LONG = "Use 80 characters or fewer to search companies.";
const INVALID_REFUSED = "We couldn’t use that search. Try a different company name.";

/**
 * Ruling 8 typeahead (switch on only): the combobox pattern over the server's
 * suggestions (at most 10); Enter or a click opens the company door. With no
 * suggestion, the paste-a-link path is the primary action and "Request a
 * company" the quiet link. Loading shows a Searching line; a failed search shows
 * the error state's retry line (the client filter below keeps working). Events
 * carry no query text, and no state reads availability (D-176).
 */
function CompanyTypeahead({ value, onChange, search, unlisted, onOpen }: { value: string; onChange(value: string): void; search: CompanySearchState; unlisted: boolean; onOpen(slug: string): void }) {
  const listId = useId();
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const tracked = useRef<string | null>(null);
  const { status, suggestions, query } = search;
  // Only Explore knows whether the directory also has no row for the query.
  const noMatch = unlisted;
  const open = !dismissed && suggestions.length > 0;

  useEffect(() => { setActive(-1); }, [query, suggestions]);
  useEffect(() => {
    if (!query || tracked.current === query) return;
    if (suggestions.length > 0) { tracked.current = query; trackClarityEvent("journey_company_suggested"); }
    else if (noMatch) { tracked.current = query; trackClarityEvent("journey_company_no_match"); }
  }, [query, suggestions, noMatch]);

  const optionId = (index: number) => `${listId}-option-${index}`;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setDismissed(true); setActive(-1); return; }
    if (!open) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => Math.min(index + 1, suggestions.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); onOpen(suggestions[active].slug); }
  };

  return (
    <div>
      <div data-testid="goal-search-input" className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-g-ink-3" strokeWidth={1.75} />
        <input
          type="text"
          role="combobox"
          aria-label="Search companies"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          value={value}
          placeholder="Company, function or industry…"
          onChange={event => { setDismissed(false); onChange(event.target.value); }}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface pl-11 pr-3 text-g-body text-g-ink placeholder:text-g-ink-3 max-gdesk:h-12"
        />
      </div>
      {open ? (
        <ul id={listId} role="listbox" aria-label="Company suggestions" className="mt-1 grid rounded-g-control border border-g-control-edge bg-g-surface py-1 shadow-g-popover">
          {suggestions.map((item, index) => (
            <li
              key={item.slug}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseDown={event => { event.preventDefault(); onOpen(item.slug); }}
              className={`cursor-pointer px-3 py-2.5 text-g-body text-g-ink max-gdesk:py-3 ${index === active ? "bg-g-surface-hover" : "hover:bg-g-surface-hover"}`}
            >
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}
      {status === "loading" ? (
        <p data-testid="company-search-loading" role="status" aria-busy="true" className="mt-3 text-g-meta text-g-ink-3">Searching companies…</p>
      ) : null}
      {status === "error" ? (
        <GoalErrorState className="px-0 py-3 max-gdesk:px-0" title="We couldn’t search companies." body="Check your connection and try again." retry={{ label: "Try again", onClick: search.retry }} />
      ) : null}
      {status === "invalid" ? (
        <p data-testid="company-search-invalid" role="status" className="mt-3 text-g-meta text-g-ink-2">{search.invalidReason === "too-long" ? INVALID_TOO_LONG : INVALID_REFUSED}</p>
      ) : null}
      {noMatch ? (
        <div data-testid="company-search-no-match" role="status" className="mt-3 grid gap-1">
          <Link href="/ask" className="text-g-label text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">{`Paste a ${query} job link to request a referral`}</Link>
          <p className="text-g-meta text-g-ink-3"><Link href="/invite" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Request a company</Link></p>
        </div>
      ) : null}
    </div>
  );
}
