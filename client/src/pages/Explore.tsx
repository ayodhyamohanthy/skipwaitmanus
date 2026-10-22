// Find a referral (D-048 phase 3; approved comp design/goal-ui/pick/find-a-referral.*):
// the company directory with search and filter chips, and the ask drawer
// (desktop: docked 480px column, no scrim; phone: full-height sheet). Every
// number comes from GET /api/companies, /api/credits/summary and the live send
// response; availability is the server's openToReferrals fact, never a guess.
// The send path is the live composer's: idempotency key, company routing,
// slot and per-company caps, sign-in hand-off with a saved prefill.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/auth";
import {
  GoalAppShell,
  GoalCompanyRow,
  GoalEmptyState,
  GoalErrorState,
  GoalFilterChip,
  GoalNum,
  GoalSearchInput,
  GoalSkeletonRows,
  useOnlineStatus,
} from "@/components/goal";
import { askErrorMessage, confirmedDomainFor, parseSentAsk, parseSlotCapReached } from "@/components/ask/askApi";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { useAskQuote } from "@/hooks/useAskQuote";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { saveAskPrefill } from "@/lib/askPrefill";
import { discardAskDraftRemote, saveAskDraftRemote, useAskDraft } from "@/lib/askDraftApi";
import { exploreDescription, useCompanyDirectory } from "@/lib/companyDirectory";
import { fastTrackAskFields } from "@/lib/fastTrackHandoff";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";
import { applySeo } from "@/lib/seo";
import { useSeekerSetup } from "@/lib/useSeekerSetup";
import { countWords } from "@shared/askQuality";
import { COMPANY_CAP_REACHED, companyCapCopy, slotCapNudgeCopy } from "@shared/openAskSlots";
import { CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { publicRoute } from "@shared/publicRoutes";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { isValidTargetRoleUrl, jobLinkFitsCompany } from "@shared/referralUrl";
import { composeWhyMe, overLimitReasons, splitWhyMe, WHY_ME_MAX, type WhyMeReasons } from "@shared/whyMe";
import { AskDrawer, type AskResume, type AskSentView } from "./explore/AskDrawer";
import { askIdempotencyKey, ASK_IDEMPOTENCY_KEY, buildAskBody } from "./explore/askSend";
import { costLine, directorySummary, filterCompanies, FILTER_FUNCTIONS, linkHint, roleTitleFromUrl } from "./explore/findModel";
import { goToSeekerSignIn } from "./explore/signInHandoff";

const MIN_WORDS = 10;

function session(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

function confirmedDomain(url: string): string | undefined {
  try { return confirmedDomainFor(url, localStorage.getItem("bridge-company-confirmation")); } catch { return undefined; }
}

const ASK_LEVEL_COST_ON = import.meta.env.VITE_ASK_LEVEL_COST === "true";

export default function Explore() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const directory = useCompanyDirectory();
  const companies = directory.data?.companies;
  const balance = useCreditBalance(Boolean(isSignedIn));
  const setup = useSeekerSetup(Boolean(isLoaded && isSignedIn), fetchToken);
  const remoteDraft = useAskDraft(Boolean(isLoaded && isSignedIn), fetchToken);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => new URLSearchParams(search).get("company"));
  const [drawerOpen, setDrawerOpen] = useState(() => Boolean(new URLSearchParams(search).get("company")));
  const closeTimer = useRef<number | null>(null);
  // The company the form was written for. Reopening the same company keeps the
  // draft; picking another one starts empty instead of carrying its link and reasons.
  const formCompany = useRef<string | null>(selectedSlug);
  // Pre-filter from the landing search bar (QA fix, #407, kept in this wave): /explore?q=...
  const [query, setQuery] = useState(() => new URLSearchParams(search).get("q") ?? "");
  const [openOnly, setOpenOnly] = useState(false);
  const [fn, setFn] = useState<(typeof FILTER_FUNCTIONS)[number] | null>(null);

  const [url, setUrl] = useState("");
  const [reasons, setReasons] = useState<WhyMeReasons>(["", "", ""]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<ResumeDoc | null>(null);
  const [linkTouched, setLinkTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [sendStage, setSendStage] = useState<"idle" | "resume" | "ask">("idle");
  const [sendError, setSendError] = useState<ReactNode>(null);
  const [sent, setSent] = useState<AskSentView | null>(null);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved">("idle");
  const [watch, setWatch] = useState<{ state: "idle" | "busy" | "done" | "error"; message: string }>({ state: "idle", message: "" });

  const company = selectedSlug ? companies?.find(item => item.slug === selectedSlug) ?? null : null;
  const shown = useMemo(() => filterCompanies(companies ?? [], { query, openOnly, fn }), [companies, query, openOnly, fn]);
  const summary = directorySummary(shown);

  // A saved draft fills only what is still empty for the company it was written for.
  useEffect(() => {
    if (!remoteDraft || !company || remoteDraft.companySlug !== company.slug) return;
    setUrl(current => current || remoteDraft.targetRoleUrl);
    setReasons(current => (current.some(reason => reason.trim()) ? current : splitWhyMe(remoteDraft.note)));
  }, [remoteDraft, company]);
  useEffect(() => { applySeo({ title: "Find a referral", description: exploreDescription(companies ?? []) ?? publicRoute("/explore")?.description, path: "/explore" }); }, [companies]);

  const resumeView: AskResume = resumeFile ? { name: resumeFile.name } : uploaded ? { name: uploaded.fileName } : setup?.resume ? { name: setup.resume.fileName } : null;
  const resumeDoc = uploaded ?? (resumeFile ? null : setup?.resume ?? null);
  const hint = linkHint(url, company, linkTouched || attempted);
  const linkOk = isValidTargetRoleUrl(url.trim()) && (!company || jobLinkFitsCompany(url, company.domains));
  const words = countWords(composeWhyMe(reasons));
  const tooLong = overLimitReasons(reasons).length > 0;
  // D-132: under V2 the drawer's cost line quotes by role level, like /ask;
  // a missing quote keeps the flat one-credit line.
  const askQuote = useAskQuote(url, ASK_LEVEL_COST_ON);
  const cost = costLine({ open: company ? company.openToReferrals : null, balance: isSignedIn && balance?.state === "ready" ? balance.count : null, quote: askQuote });
  const context = company ? [company.name, roleTitleFromUrl(url)].filter(Boolean).join(" · ") : roleTitleFromUrl(url);

  const missing = !linkOk
    ? (hint?.tone === "error" ? hint.text : "Add the official job link first.")
    : isSignedIn && !resumeView ? "Add your resume first."
      : tooLong ? `Keep each reason to ${WHY_ME_MAX} characters.`
        : words < MIN_WORDS ? "Write your reasons first (at least a sentence or two)."
          : null;
  const blocked = !online ? "You’re offline. Sending needs a connection." : isSignedIn ? cost.blockedReason ?? undefined : undefined;

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  useEffect(() => () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); }, []);
  const selectCompany = (slug: string) => {
    clearCloseTimer();
    if (formCompany.current !== slug) {
      formCompany.current = slug;
      setUrl("");
      setReasons(["", "", ""]);
      setLinkTouched(false);
      setAttempted(false);
      setResumeError("");
      setSendError(null);
      setSent(null);
      setWatch({ state: "idle", message: "" });
      setDraftState("idle");
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
      setSent(null);
      setSendError(null);
    }, 200);
  };
  const closeDrawer = (open: boolean) => {
    if (open || !selectedSlug) return;
    dismissDrawer(() => navigate("/explore", { replace: true }));
  };
  const pickResume = (file: File | null) => {
    if (!file) return;
    const invalid = validateResumeFile(file);
    setResumeError(invalid ?? "");
    if (!invalid) { setResumeFile(file); setUploaded(null); }
  };

  const ensureResume = async (): Promise<ResumeDoc> => {
    if (resumeFile) {
      setSendStage("resume");
      const doc = await uploadResume(resumeFile, fetchToken);
      setUploaded(doc);
      setResumeFile(null);
      return doc;
    }
    if (resumeDoc) return resumeDoc;
    throw new Error("Add your resume before sending this ask.");
  };

  const send = async () => {
    setAttempted(true);
    setSendError(null);
    if (missing || blocked || sendStage !== "idle") {
      if (missing) setSendError(missing);
      return;
    }
    if (!isSignedIn) {
      // Sign in first; the company, link and reasons come back on /ask, where the seeker finishes.
      if (company && saveAskPrefill({ companySlug: company.slug, targetRoleUrl: url, note: composeWhyMe(reasons) })) {
        goToSeekerSignIn("/ask");
        return;
      }
      goToSeekerSignIn("/ask");
      return;
    }
    try {
      const doc = await ensureResume();
      setSendStage("ask");
      const body = buildAskBody({
        targetRoleUrl: url,
        reasons,
        resumeId: doc.id,
        companySlug: company?.slug ?? null,
        fastTrack: fastTrackAskFields(window.location.search),
        confirmedCompanyDomain: confirmedDomain(url.trim()),
      });
      const token = await fetchToken();
      const response = await fetch("/api/company-referrals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": askIdempotencyKey(session()), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const payload = await readApiJson<Record<string, unknown>>(response, "We could not send this ask");
      const capped = parseSlotCapReached(response.status, payload);
      if (capped) {
        const copy = slotCapNudgeCopy(capped.slots);
        setSendError(<><strong className="font-semibold">{copy.title}.</strong> {copy.body}{copy.cta ? <> <Link href="/plans" className="underline decoration-g-control-edge underline-offset-[3px]">{copy.cta}</Link></> : null}</>);
        return;
      }
      if (response.status === 409 && payload.code === COMPANY_CAP_REACHED && typeof payload.companyDomain === "string") {
        setSendError(companyCapCopy(payload.companyDomain));
        return;
      }
      const created = response.ok ? parseSentAsk(payload) : null;
      if (!created) throw new Error(typeof payload.error === "string" ? payload.error : "We could not send this ask");
      session()?.removeItem(ASK_IDEMPOTENCY_KEY);
      void discardAskDraftRemote(fetchToken);
      const name = company?.name ?? created.companyDomain ?? "the company";
      const where = created.companyDomain ? `${created.companyDomain} ` : "";
      setSent({
        company: name,
        detail: created.fastTrack
          ? `Only the ${where}employee whose link you used will see it. If they don’t pick it up within ${ASK_TTL_DAYS} days, it closes and the credit comes back, ${CREDIT_ENDED_CAVEAT}.`
          : created.waitingForCoverage
            ? `No verified employee there can see it yet, so nothing was spent. It waits for free up to ${COVERAGE_WAIT_DAYS} days: when one can see it, 1 credit is used and it goes live; if you have no credit then, we hold it until you add one.`
            : `Verified ${where}employees can see it now. If nobody picks it up within ${ASK_TTL_DAYS} days, it closes and the credit comes back, ${CREDIT_ENDED_CAVEAT}; once someone picks it up, the credit stays spent.`,
        slots: created.slots ? (created.slots.cap === null ? `Open asks ${created.slots.open}` : `Open asks ${created.slots.open} of ${created.slots.cap}`) : null,
        trackHref: `/conversation/${created.requestId}`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credit-balance"] }),
        queryClient.invalidateQueries({ queryKey: ["requests", "mine"] }),
      ]);
    } catch (reason) {
      setSendError(askErrorMessage(reason, "We could not send this ask"));
    } finally {
      setSendStage("idle");
    }
  };

  const saveDraft = async () => {
    if (!company) return;
    if (!isValidTargetRoleUrl(url.trim())) { setLinkTouched(true); setSendError("Add a valid job link to save a draft."); return; }
    setDraftState("saving");
    try {
      await saveAskDraftRemote({ companySlug: company.slug, targetRoleUrl: url.trim(), note: composeWhyMe(reasons) }, fetchToken);
      setDraftState("saved");
    } catch (reason) {
      setDraftState("idle");
      setSendError(reason instanceof Error ? reason.message : "We could not save your draft. Try again.");
    }
  };

  const watchCompany = async () => {
    if (!company) return;
    if (!isSignedIn) { goToSeekerSignIn(`/explore?company=${company.slug}`); return; }
    setWatch({ state: "busy", message: "" });
    try {
      const token = await fetchToken();
      const response = await fetch("/api/seeker-alerts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyDomain: company.domains[0] }),
      });
      const payload = await readApiJson<Record<string, unknown>>(response, "We could not save your alert");
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "We could not save your alert");
      setWatch({ state: "done", message: `We’ll tell you when a verified employee at ${company.name} joins.` });
    } catch (reason) {
      setWatch({ state: "error", message: reason instanceof Error ? reason.message : "We could not save your alert" });
    }
  };

  const another = () => {
    dismissDrawer(() => {
      setUrl("");
      setReasons(["", "", ""]);
      setResumeFile(null);
      setUploaded(null);
      setAttempted(false);
      setLinkTouched(false);
      setWatch({ state: "idle", message: "" });
      navigate("/explore", { replace: true });
    });
  };

  const clearFilters = () => { setQuery(""); setOpenOnly(false); setFn(null); };

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
          <span aria-hidden="true" className="px-1.5">·</span>
          <GoalNum className="text-g-ink-2">{summary.open}</GoalNum> open to requests
        </p>
        <ul aria-label="Companies" className="-mx-2 mt-2 grid max-gdesk:mx-0">
          {shown.map(item => (
            <GoalCompanyRow
              key={item.slug}
              testId={`goal-company-${item.slug}`}
              name={item.name}
              initials={item.initials}
              functions={item.functions}
              open={item.openToReferrals}
              selected={company?.slug === item.slug}
              href={`/explore/${item.slug}`}
              onSelect={() => selectCompany(item.slug)}
            />
          ))}
        </ul>
        <p className="mt-4 text-g-meta text-g-ink-3">Availability can change. No referral is guaranteed.</p>
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
          context={sent ? null : context}
          signedIn={Boolean(isSignedIn)}
          url={url}
          onUrlChange={value => { setUrl(value); setDraftState("idle"); }}
          onUrlBlur={() => setLinkTouched(true)}
          hint={hint}
          resume={resumeView}
          onPickResume={pickResume}
          resumeError={resumeError || (attempted && isSignedIn && !resumeView ? "Add your resume. It’s shared only after a referrer accepts." : "")}
          reasons={reasons}
          onReasonChange={(index, value) => {
            setReasons(current => [index === 0 ? value : current[0], index === 1 ? value : current[1], index === 2 ? value : current[2]]);
            setDraftState("idle");
          }}
          reasonsError={attempted && words < MIN_WORDS ? "Write your reasons first: one specific result beats a list of skills." : ""}
          watch={company.openToReferrals ? null : { ...watch, onWatch: () => { void watchCompany(); } }}
          cost={cost}
          sendLabel={isSignedIn ? "Send ask" : "Sign in and send"}
          sendBusyLabel={sendStage === "resume" ? "Uploading your resume…" : "Sending your ask…"}
          sending={sendStage !== "idle"}
          sendBlocked={blocked}
          onSend={() => { void send(); }}
          onSaveDraft={isSignedIn ? () => { void saveDraft(); } : null}
          draftState={draftState}
          error={sendError}
          sent={sent}
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
          <GoalFilterChip label="All companies" pressed={!openOnly && fn === null} onPressedChange={() => { setOpenOnly(false); setFn(null); }} />
          <GoalFilterChip label="Open to requests" pressed={openOnly} onPressedChange={setOpenOnly} />
          {FILTER_FUNCTIONS.map(item => (
            <GoalFilterChip key={item} label={item} pressed={fn === item} onPressedChange={pressed => setFn(pressed ? item : null)} />
          ))}
        </div>
        {directoryBody}
      </div>
    </GoalAppShell>
  );
}
