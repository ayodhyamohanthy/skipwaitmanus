// Find a referral (D-048 phase 3; approved comp design/goal-ui/pick/find-a-referral.*): the company directory with
// search and filter chips, and the ask drawer (desktop: docked 480px column, no scrim; phone: full-height sheet).
// /explore and /ask render this screen; /ask opens the drawer with whatever the seeker brought: a company page's
// prefill, a saved draft, a posted role (D-022) or a referrer's personal link (D-017). The send path is the old
// composer's, unchanged: idempotency key, routing fields, slot and company caps, sign-in hand-off with prefill.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/auth";
import { AppShell } from "@/components/AppShell";
import {
  GoalAvailability,
  GoalChipGroup,
  GoalCompanyMark,
  GoalEmptyState,
  GoalErrorState,
  GoalFilterChip,
  GoalListRow,
  GoalNum,
  GoalSearchInput,
  GoalSkeletonRows,
  useOnlineStatus,
} from "@/components/goal";
import { askErrorMessage, confirmedDomainFor, parseSentAsk, parseSlotCapReached } from "@/components/ask/askApi";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { clearAskPrefill, readAskPrefill, saveAskPrefill } from "@/lib/askPrefill";
import { discardAskDraftRemote, saveAskDraftRemote, useAskDraft } from "@/lib/askDraftApi";
import { exploreDescription, useCompanyDirectory } from "@/lib/companyDirectory";
import { fastTrackAskFields } from "@/lib/fastTrackHandoff";
import { useCreditBalance } from "@/lib/goalShellData";
import { clearReferralDraft, readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";
import { applySeo } from "@/lib/seo";
import { useSeekerSetup } from "@/lib/useSeekerSetup";
import type { PublicCompany } from "@shared/companies";
import { parseOpportunityAskSearch } from "@shared/companyOpportunities";
import type { JobFunction } from "@shared/jobFunctions";
import { CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { COMPANY_CAP_REACHED, companyCapCopy, slotCapNudgeCopy } from "@shared/openAskSlots";
import { publicRoute } from "@shared/publicRoutes";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { isValidTargetRoleUrl, jobLinkFitsCompany } from "@shared/referralUrl";
import { roleTitleFromUrl } from "@shared/roleTitle";
import { countWords } from "@shared/askQuality";
import { overLimitReasons, splitWhyMe, composeWhyMe, WHY_ME_MAX, type WhyMeReasons } from "@shared/whyMe";
import { AskDrawer, type AskResume, type AskSentView } from "./AskDrawer";
import { askIdempotencyKey, ASK_IDEMPOTENCY_KEY, buildAskBody } from "./askSend";
import { goToSeekerSignIn } from "./signInHandoff";
import { costLine, directorySummary, filterCompanies, FILTER_FUNCTIONS, linkHint } from "./findModel";

type Resume = { kind: "file"; file: File } | { kind: "doc"; doc: ResumeDoc } | null;
const MIN_WORDS = 10;

function session(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
function confirmedDomain(url: string): string | undefined {
  try { return confirmedDomainFor(url, localStorage.getItem("bridge-company-confirmation")); } catch { return undefined; }
}
const hostOf = (value: string) => {
  try { return new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
};

export default function FindReferral() {
  const { isLoaded, isSignedIn, userId, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [path, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const directory = useCompanyDirectory();
  const companies = directory.data?.companies;
  const balance = useCreditBalance(Boolean(isSignedIn));
  const setup = useSeekerSetup(Boolean(isLoaded && isSignedIn), fetchToken);
  const remoteDraft = useAskDraft(Boolean(isLoaded && isSignedIn), fetchToken);
  const onAsk = path === "/ask";

  // What the seeker brought (read once): a company page's prefill wins, then a posted role, then a personal-link draft.
  const [prefill] = useState(() => readAskPrefill());
  const [post, setPost] = useState(() => (typeof window === "undefined" ? null : parseOpportunityAskSearch(window.location.search)));
  const [bridge] = useState(() => (prefill ? null : readReferralDraft()));
  const [url, setUrl] = useState(() => prefill?.targetRoleUrl ?? post?.jobUrl ?? (bridge && isValidTargetRoleUrl(bridge.targetUrl) ? bridge.targetUrl : ""));
  const [reasons, setReasons] = useState<WhyMeReasons>(() => splitWhyMe(prefill?.note));
  const [resume, setResume] = useState<Resume>(null);
  const [linkTouched, setLinkTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [sendStage, setSendStage] = useState<"idle" | "resume" | "ask">("idle");
  const [sendError, setSendError] = useState<ReactNode>(null);
  const [sent, setSent] = useState<AskSentView | null>(null);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved">("idle");
  const [askOpen, setAskOpen] = useState(onAsk);
  const [watch, setWatch] = useState<{ state: "idle" | "busy" | "done" | "error"; message: string }>({ state: "idle", message: "" });

  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [fn, setFn] = useState<JobFunction | null>(null);

  // A saved draft fills only what is still empty (the prefill and a posted role are fresher).
  useEffect(() => {
    if (!remoteDraft) return;
    setUrl(current => current || remoteDraft.targetRoleUrl);
    setReasons(current => (current.some(reason => reason.trim()) ? current : splitWhyMe(remoteDraft.note)));
  }, [remoteDraft]);
  useEffect(() => { applySeo({ title: "Explore companies", description: exploreDescription(companies ?? []) ?? publicRoute("/explore")?.description, path: "/explore" }); }, [companies]);

  const params = new URLSearchParams(search);
  const bySlug = (slug: string | null | undefined) => (slug && companies ? companies.find(company => company.slug === slug) ?? null : null);
  const chosen = bySlug(params.get("company")) ?? bySlug(prefill?.companySlug) ?? (remoteDraft && url === remoteDraft.targetRoleUrl ? bySlug(remoteDraft.companySlug) : null);
  const fromLink = useMemo(() => {
    const host = hostOf(url);
    return host && companies ? companies.find(company => company.domains.some(domain => host === domain || host.endsWith(`.${domain}`))) ?? null : null;
  }, [url, companies]);
  const company: PublicCompany | null = chosen ?? (onAsk ? fromLink : null);
  const drawerOpen = Boolean(chosen && params.get("company")) || (onAsk && askOpen);
  const shown = useMemo(() => filterCompanies(companies ?? [], { query, openOnly, fn }), [companies, query, openOnly, fn]);
  const summary = directorySummary(shown);

  const resumeView: AskResume = resume?.kind === "file" ? { kind: "file", name: resume.file.name } : resume?.kind === "doc" ? { kind: "doc", name: resume.doc.fileName } : setup?.resume ? { kind: "doc", name: setup.resume.fileName } : null;
  const resumeDoc = resume?.kind === "doc" ? resume.doc : !resume && setup?.resume ? setup.resume : null;
  const hint = linkHint(url, company, linkTouched || attempted);
  const linkOk = isValidTargetRoleUrl(url.trim()) && (!company || jobLinkFitsCompany(url, company.domains));
  const words = countWords(composeWhyMe(reasons));
  const tooLong = overLimitReasons(reasons).length > 0;
  const cost = costLine({ open: company ? company.openToReferrals : null, balance: isSignedIn && balance.isSuccess ? balance.data : null });
  const roleName = roleTitleFromUrl(url);
  const context = company ? [company.name, roleName].filter(Boolean).join(" · ") : roleName;

  // A resume uploads only after sign-in, so a signed-out seeker adds it on /ask once they are back.
  const missing = !linkOk ? "Add the official job link first." : isSignedIn && !resumeView ? "Add your resume first." : tooLong ? `Keep each reason to ${WHY_ME_MAX} characters.` : words < MIN_WORDS ? "Write your reasons first (at least a sentence or two)." : null;
  const blocked = !online ? "You’re offline. Sending needs a connection." : isSignedIn ? cost.blockedReason ?? undefined : undefined;

  const selectCompany = (slug: string) => { setSent(null); setSendError(null); navigate(`/explore?company=${encodeURIComponent(slug)}`, { replace: true }); };
  const closeDrawer = (open: boolean) => {
    if (open) return;
    if (onAsk) setAskOpen(false);
    else navigate("/explore", { replace: true });
  };
  const setReason = (index: number, value: string) =>
    setReasons(current => [index === 0 ? value : current[0], index === 1 ? value : current[1], index === 2 ? value : current[2]]);
  const pickResume = (file: File | null) => {
    if (!file) return;
    const invalid = validateResumeFile(file);
    setResumeError(invalid ?? "");
    if (!invalid) setResume({ kind: "file", file });
  };

  const ensureResume = async (): Promise<ResumeDoc> => {
    if (resume?.kind === "file") {
      setSendStage("resume");
      const uploaded = await uploadResume(resume.file, fetchToken);
      setResume({ kind: "doc", doc: uploaded });
      return uploaded;
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
      // Sign in first; the link and reasons come back on /ask (a company page's prefill, or the personal-link draft).
      if (company && saveAskPrefill({ companySlug: company.slug, targetRoleUrl: url, note: composeWhyMe(reasons) })) {
        goToSeekerSignIn("/ask");
        return;
      }
      saveReferralDraft({ name: "", targetUrl: url.trim() });
      openSignIn({ returnTo: `/ask${typeof window === "undefined" ? "" : window.location.search}` });
      return;
    }
    try {
      const doc = await ensureResume();
      setSendStage("ask");
      const body = buildAskBody({
        targetRoleUrl: url,
        reasons,
        resumeId: doc.id,
        companySlug: chosen?.slug ?? null,
        post: post ? { opportunityId: post.opportunityId } : null,
        fastTrack: fastTrackAskFields(typeof window === "undefined" ? "" : window.location.search),
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
      clearAskPrefill();
      clearReferralDraft();
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
        trackHref: `/requests?ask=${created.requestId}`,
      });
      setPost(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["requests", "mine"] }), queryClient.invalidateQueries({ queryKey: ["credits"] })]);
    } catch (reason) {
      setSendError(askErrorMessage(reason, "We could not send this ask"));
    } finally {
      setSendStage("idle");
    }
  };

  const saveDraft = async () => {
    if (!isValidTargetRoleUrl(url.trim())) { setLinkTouched(true); setSendError("Add a valid job link to save a draft."); return; }
    setDraftState("saving");
    try {
      await saveAskDraftRemote({ companySlug: company?.slug ?? "", targetRoleUrl: url.trim(), note: composeWhyMe(reasons) }, fetchToken);
      setDraftState("saved");
    } catch (reason) {
      setDraftState("idle");
      setSendError(reason instanceof Error ? reason.message : "We could not save your draft. Try again.");
    }
  };

  const watchCompany = async () => {
    if (!company) return;
    if (!isSignedIn) { openSignIn({ returnTo: `/explore?company=${company.slug}` }); return; }
    setWatch({ state: "busy", message: "" });
    try {
      const token = await fetchToken();
      const response = await fetch("/api/seeker-alerts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ companyDomain: company.domains[0] }) });
      const payload = await readApiJson<Record<string, unknown>>(response, "We could not save your alert");
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "We could not save your alert");
      setWatch({ state: "done", message: `We’ll tell you when a verified employee at ${company.name} joins.` });
    } catch (reason) {
      setWatch({ state: "error", message: reason instanceof Error ? reason.message : "We could not save your alert" });
    }
  };

  const another = () => {
    setSent(null);
    setUrl("");
    setReasons(["", "", ""]);
    setResume(null);
    setAttempted(false);
    setLinkTouched(false);
    setWatch({ state: "idle", message: "" });
    navigate("/explore", { replace: true });
  };

  const drawer = (
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
      onReasonChange={(index, value) => { setReason(index, value); setDraftState("idle"); }}
      reasonsError={attempted && words < MIN_WORDS ? "Write your reasons first: one specific result beats a list of skills." : ""}
      postNote={Boolean(post)}
      watch={company && !company.openToReferrals ? { ...watch, onWatch: () => { void watchCompany(); } } : null}
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
  );

  let directoryBody: ReactNode;
  if (!companies && directory.isError) directoryBody = <GoalErrorState className="px-0" title="We couldn’t load companies." retry={{ label: "Try again", onClick: () => { void directory.refetch(); } }} />;
  else if (!companies) directoryBody = <div className="mt-6"><GoalSkeletonRows density="company" count={6} label="Loading companies" /></div>;
  else if (shown.length === 0) {
    directoryBody = (
      <GoalEmptyState
        className="px-0"
        title="No matching companies yet"
        body={<>Try a wider search, or <Link href="/invite" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">request a company</Link>.</>}
        action={{ label: "Clear filters", onClick: () => { setQuery(""); setOpenOnly(false); setFn(null); } }}
      />
    );
  } else {
    directoryBody = (
      <>
        <p className="mt-7 text-g-meta text-g-ink-3 max-gdesk:mt-6">
          <GoalNum className="text-g-ink-2">{summary.total}</GoalNum> {summary.total === 1 ? "company" : "companies"}
          <span aria-hidden="true" className="px-1.5">·</span>
          <GoalNum className="text-g-ink-2">{summary.open}</GoalNum> open to requests
        </p>
        <ul aria-label="Companies" className="-mx-2 mt-2 grid max-gdesk:mx-0">
          {shown.map(item => (
            <GoalListRow
              key={item.slug}
              density="company"
              selected={drawerOpen && company?.slug === item.slug}
              onSelect={() => selectCompany(item.slug)}
              aria-label={`${item.name}, ${item.openToReferrals ? "open to requests" : "not open yet"}`}
              testId={`goal-company-${item.slug}`}
              leading={<GoalCompanyMark name={item.name} selected={drawerOpen && company?.slug === item.slug} />}
              title={item.name}
              meta={item.functions.join(" · ")}
              trailing={<GoalAvailability open={item.openToReferrals} label={item.openToReferrals ? "Open to requests" : "Not open yet"} />}
            />
          ))}
        </ul>
        <p className="mt-4 text-g-meta text-g-ink-3">Availability can change. No referral is guaranteed.</p>
      </>
    );
  }

  return (
    <AppShell active="find" title="Find a referral" drawer={drawer}>
      <div data-skipwait-screen="find-a-referral" className="max-w-[760px] px-8 pb-8 pt-10 max-gdesk:px-4 max-gdesk:pb-6 max-gdesk:pt-6">
        <h1 className="text-balance text-g-display text-g-ink">Where do you want a referral?</h1>
        <p className="mt-2 text-pretty text-g-body text-g-ink-2">Ask a verified employee. Your name and resume stay private until they accept.</p>
        <GoalSearchInput className="mt-6 max-gdesk:mt-5" label="Search companies" placeholder="Company, function or industry…" value={query} maxLength={100} onValueChange={setQuery} />
        <div className="mt-4">
          <GoalChipGroup label="Filter companies">
            <GoalFilterChip pressed={!openOnly && fn === null} onPressedChange={() => { setOpenOnly(false); setFn(null); }}>All companies</GoalFilterChip>
            <GoalFilterChip pressed={openOnly} onPressedChange={setOpenOnly}>Open to requests</GoalFilterChip>
            {FILTER_FUNCTIONS.map(item => (
              <GoalFilterChip key={item} pressed={fn === item} onPressedChange={pressed => setFn(pressed ? item : null)}>{item}</GoalFilterChip>
            ))}
          </GoalChipGroup>
        </div>
        {directoryBody}
      </div>
    </AppShell>
  );
}
