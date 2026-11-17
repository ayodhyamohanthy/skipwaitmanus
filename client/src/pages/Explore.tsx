// Find a referral, redesigned to the doctrine (D-048-p3-live-review-find;
// contract "Get referred." in docs/plans/GOAL_UI_MIGRATION.md): the seeker
// home of the contract. It opens with the goal line, holds the search inside
// the single "Your next step" block with one black commit ("Find your
// company": opens the door when the search names exactly one company, routes
// an unlisted company to the paste-a-link path on /ask, and otherwise hands
// the seeker to the filtered list), states the free-credit line from the
// shared money copy, and closes with the three-step how-it-goes. The ask
// drawer (desktop: docked 480px column, no scrim; phone: full-height sheet)
// and its composer machinery (useAskComposer, shared with the company page)
// are unchanged; every number comes from GET /api/companies,
// /api/credits/summary and the live send response; D-176: availability never
// appears in the directory - it only routes the sent ask.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import {
  GoalAppShell,
  GoalButton,
  GoalCompanyRow,
  GoalEmptyState,
  GoalErrorState,
  GoalFilterChip,
  GoalNextStep,
  GoalNum,
  GoalSearchInput,
  GoalSkeletonRows,
} from "@/components/goal";
import { FREE_ASKS_CHIP } from "@shared/moneyCopy";
import { exploreDescription, useCompanyDirectory } from "@/lib/companyDirectory";
import { CompanyDemandList } from "@/components/demand/CompanyDemandList";
import { trackClarityEvent } from "@/lib/clarity";
import { applySeo } from "@/lib/seo";
import { publicRoute } from "@shared/publicRoutes";
import { AskDrawer } from "./explore/AskDrawer";
import { directorySummary, filterCompanies, FILTER_FUNCTIONS } from "./explore/findModel";
import { useAskComposer } from "./explore/useAskComposer";
import { COMPANY_TYPEAHEAD_ENABLED, useCompanySearch, type CompanySearchState, type DiscoveredSuggestion } from "./explore/useCompanySearch";

// The goal line is the seeker's goal in their words; the directory IS the
// next step, so the search lives inside the block. The page does not export
// GOAL_PAGE yet: §1.7's assertGoalPage needs exactly one h1, and the goal
// shell renders a second h1 of its own (GoalShell.tsx:150, foundation-owned)
// — the recorded blocker for every GoalAppShell page (D-048-p3-live-review-
// conversation's landing record). Exporting it before that passes would be a
// claim the page's own test could not make.
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
  const queryMatches = useMemo(() => filterCompanies(companies ?? [], { query, fn: null }), [companies, query]);
  const queryMatched = queryMatches.length > 0;
  const noMatch = typeahead && Boolean(companies) && companySearch.status === "ready" && companySearch.noMatch && !queryMatched;
  // No empty-directory claim while the search is in flight, failed, or suggested a company the filter misses.
  // When the query does match rows the chip hides, the filter empty state is the truthful line and stays.
  // Invalid input speaks for itself (the typeahead's invalid line), so the directory never claims the company is missing.
  const searchSpeaks = typeahead && (companySearch.status === "invalid" || (!queryMatched && (companySearch.status === "loading" || companySearch.status === "error" || (companySearch.status === "ready" && (companySearch.suggestions.length > 0 || companySearch.discovered.length > 0)))));

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

  // The next step's single black commit: an unambiguous search opens the
  // company's door; an answered no-match routes to /ask's paste-a-link path
  // (the same hand-off the typeahead's no-match state offers); anything else
  // hands the seeker to the filtered list. Unlisted needs an answered read
  // (the file's own invariant above): /ask is never the answer while the
  // directory is loading or failed, and the query alone decides — the active
  // function chip only narrows the list, so it never makes a company unlisted.
  const unlistedAnswered = noMatch || (!typeahead && Boolean(companies) && !directory.isError && !queryMatched);
  // An enabled commit must always do something (N6): the one remaining no-op is
  // an empty filtered list where the query names several (or no) companies.
  const commitDoesNothing = shown.length === 0 && !unlistedAnswered && queryMatches.length !== 1;
  const commitBlockedReason = commitDoesNothing
    ? searchSpeaks
      ? "Pick a company from the suggestions."
      : queryMatched
        ? "Clear the filters to see matching companies."
        : "Widen the name to see matches."
    : undefined;
  const findCompany = () => {
    if (!query.trim()) return;
    if (shown.length === 1) { selectCompany(shown[0].slug); return; }
    if (shown.length === 0) {
      if (unlistedAnswered) { navigate("/ask"); return; }
      // The query alone decides: one named company opens even while a chip
      // hides its row, so an enabled commit always does something (N6).
      if (queryMatches.length === 1) { selectCompany(queryMatches[0].slug); return; }
      return;
    }
    listRef.current?.focus();
  };
  const listRef = useRef<HTMLUListElement | null>(null);

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
        <ul ref={listRef} tabIndex={-1} aria-label="Companies" className="-mx-2 mt-2 grid max-gdesk:mx-0 focus:outline-none">
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
        <h1 className="text-balance text-g-display text-g-ink">Get referred.</h1>
        <p className="mt-2 text-pretty text-g-body text-g-ink-2">Ask a verified employee. Your name and resume stay private until they accept.</p>
        <div className="mt-6 max-gdesk:mt-5">
        <GoalNextStep reason="Search for your company, then request a referral.">
          <div>
            {typeahead ? (
              <CompanyTypeahead value={query} onChange={setQuery} search={companySearch} unlisted={noMatch} onOpen={slug => navigate(`/explore/${slug}`)} />
            ) : (
              <GoalSearchInput label="Search companies" placeholder="Company, function or industry…" value={query} onChange={setQuery} />
            )}
          </div>
          <div className="mt-3 max-gdesk:grid">
            <GoalButton
              variant="primary"
              touch="large"
              className="gdesk:min-w-[240px]"
              disabledReason={
                !query.trim()
                  ? "Type a company name to search."
                  : directory.isError
                    ? "Companies could not load. Try again, then search."
                    : !companies
                      ? "Still loading companies."
                      : typeahead && companySearch.status === "loading"
                        ? "Still checking that name."
                        : commitBlockedReason
              }
              onClick={findCompany}
            >
              Find your company
            </GoalButton>
          </div>
        </GoalNextStep>
        </div>
        <p className="mt-3 text-g-meta text-g-ink-3">{FREE_ASKS_CHIP}.</p>
        <div role="group" aria-label="Filter companies" className="mt-4 flex flex-wrap gap-2 max-gdesk:gap-y-3">
          <GoalFilterChip label="All companies" pressed={fn === null} onPressedChange={() => { setFn(null); }} />
          {FILTER_FUNCTIONS.map(item => (
            <GoalFilterChip key={item} label={item} pressed={fn === item} onPressedChange={pressed => setFn(pressed ? item : null)} />
          ))}
        </div>
        {directoryBody}
        {/* D-086.mount: the browse state only (empty search); renders nothing while the switch is off. */}
        {!query.trim() && !fn ? <div className="mt-10"><CompanyDemandList /></div> : null}
        <section className="mt-10" aria-label="How it goes">
          <h2 className="text-g-heading text-g-ink">How it goes</h2>
          <ol className="mt-3 divide-y divide-g-hairline border-t border-g-hairline">
            {[
              ["Find your company", "Search companies where verified employees can review requests."],
              ["Paste the job link and say why you fit", "One link and three short reasons. Your name and resume stay private until an employee accepts."],
              ["A verified employee accepts and refers", "You see their answer in My asks. No referral is guaranteed."],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4 py-4">
                <span aria-hidden="true" className="font-g-mono text-g-meta text-g-ink-3">{`0${index + 1}`}</span>
                <div className="min-w-0">
                  <p className="text-g-label text-g-ink">{title}</p>
                  <p className="mt-0.5 text-g-meta text-g-ink-3">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
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
/** Discovered-candidate logo: the CSP allows same-origin images only, so a Commons logo can be blocked; a blocked or broken logo degrades to the company's initial, never a broken image. */
function DiscoveredLogo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [broken, setBroken] = useState(false);
  if (!logoUrl || broken) {
    return <span aria-hidden="true" data-testid="company-discovery-initial" className="grid size-5 shrink-0 place-items-center rounded-sm bg-g-surface-hover text-[10px] font-semibold text-g-ink-3">{(name.trim().charAt(0) || "?").toUpperCase()}</span>;
  }
  return <img src={logoUrl} alt="" onError={() => setBroken(true)} className="size-5 shrink-0 rounded-sm object-contain" />;
}

function CompanyTypeahead({ value, onChange, search, unlisted, onOpen }: { value: string; onChange(value: string): void; search: CompanySearchState; unlisted: boolean; onOpen(slug: string): void }) {
  const listId = useId();
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  // A discovered (worldwide, not-in-directory) candidate the seeker picked; it confirms before acting.
  const [confirm, setConfirm] = useState<DiscoveredSuggestion | null>(null);
  const tracked = useRef<string | null>(null);
  const { status, suggestions, discovered, query } = search;
  // Only Explore knows whether the directory also has no row for the query.
  const noMatch = unlisted;
  const options: ({ kind: "directory"; item: (typeof suggestions)[number] } | { kind: "discovered"; item: DiscoveredSuggestion })[] = [
    ...suggestions.map(item => ({ kind: "directory" as const, item })),
    ...discovered.map(item => ({ kind: "discovered" as const, item })),
  ];
  const open = !dismissed && !confirm && options.length > 0;

  useEffect(() => { setActive(-1); }, [query, suggestions, discovered]);
  useEffect(() => { setConfirm(null); }, [query]);
  useEffect(() => {
    if (!query || tracked.current === query) return;
    if (options.length > 0) { tracked.current = query; trackClarityEvent("journey_company_suggested"); }
    else if (noMatch) { tracked.current = query; trackClarityEvent("journey_company_no_match"); }
  }, [query, options.length, noMatch]);

  const choose = (option: (typeof options)[number]) => {
    if (option.kind === "directory") onOpen(option.item.slug);
    else setConfirm(option.item);
  };
  const optionId = (index: number) => `${listId}-option-${index}`;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setDismissed(true); setConfirm(null); setActive(-1); return; }
    if (!open) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => Math.min(index + 1, options.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(options[active]); }
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
          {options.map((option, index) => (
            <li
              key={option.kind === "directory" ? option.item.slug : option.item.domain}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseDown={event => { event.preventDefault(); choose(option); }}
              className={`cursor-pointer px-3 py-2.5 text-g-body text-g-ink max-gdesk:py-3 ${index === active ? "bg-g-surface-hover" : "hover:bg-g-surface-hover"}`}
            >
              {option.kind === "directory" ? (
                option.item.name
              ) : (
                <span className="flex items-center gap-2" data-testid="company-discovery-option">
                  <DiscoveredLogo name={option.item.name} logoUrl={option.item.logoUrl} />
                  <span>{option.item.name}</span>
                  <span className="text-g-meta text-g-ink-3">{option.item.domain}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {confirm ? (
        <div data-testid="company-discovery-confirm" className="mt-3 grid gap-1">
          <p className="text-g-body text-g-ink">{confirm.name} · {confirm.domain}</p>
          <p className="text-g-meta text-g-ink-3">No referral door at {confirm.name} yet, so this pick can't start an ask by itself. Paste a job link on the ask page, or ask us to open the door.</p>
          <Link href="/ask" className="text-g-label text-g-ink underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">{`Paste a ${confirm.name} job link to request a referral`}</Link>
          <p className="text-g-meta text-g-ink-3"><Link href="/invite" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">{`Ask us to open ${confirm.name}'s door`}</Link></p>
          <button type="button" onClick={() => setConfirm(null)} className="justify-self-start text-g-meta text-g-ink-3 underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Back to results</button>
        </div>
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
