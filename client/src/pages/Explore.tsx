// Find a referral (D-048 phase 3; approved comp design/goal-ui/pick/find-a-referral.*):
// the company directory with search and filter chips, and the ask drawer
// (desktop: docked 480px column, no scrim; phone: full-height sheet). Every
// number comes from GET /api/companies, /api/credits/summary and the live send
// response; D-176: availability never appears in the directory - it only routes the sent ask.
// The composer machinery is useAskComposer, shared with the company page.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { applySeo } from "@/lib/seo";
import { publicRoute } from "@shared/publicRoutes";
import { AskDrawer } from "./explore/AskDrawer";
import { directorySummary, filterCompanies, FILTER_FUNCTIONS } from "./explore/findModel";
import { useAskComposer } from "./explore/useAskComposer";

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
  } else if (shown.length === 0) {
    directoryBody = (
      <div>
        <GoalEmptyState className="px-0" title="No matching companies yet" body="Try a wider search. If your company is missing, request it and we’ll open the door." action={{ label: "Clear filters", onClick: clearFilters }} />
        <p className="text-g-meta"><Link href="/invite" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Request a company</Link></p>
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
          sendLabel={composer.sendLabel}
          sendBusyLabel={composer.sendBusyLabel}
          sending={composer.sending}
          sendBlocked={composer.sendBlocked}
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
          <GoalSearchInput label="Search companies" placeholder="Company, function or industry…" value={query} onChange={setQuery} />
        </div>
        <div role="group" aria-label="Filter companies" className="mt-4 flex flex-wrap gap-2 max-gdesk:gap-y-3">
          <GoalFilterChip label="All companies" pressed={fn === null} onPressedChange={() => { setFn(null); }} />
          {FILTER_FUNCTIONS.map(item => (
            <GoalFilterChip key={item} label={item} pressed={fn === item} onPressedChange={pressed => setFn(pressed ? item : null)} />
          ))}
        </div>
        {directoryBody}
      </div>
    </GoalAppShell>
  );
}
