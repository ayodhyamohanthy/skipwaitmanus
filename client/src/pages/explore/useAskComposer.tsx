// The ask composer's form state and live send path, shared by the /explore
// directory drawer and the /explore/:slug company page (D-048 phase 3 W2).
// Owns the job link, the three "Why me" reasons (D-077(4)), the resume
// pick/upload, the remote draft, the cost line and the send itself
// (idempotency key, slot and per-company caps, sign-in hand-off with a saved
// prefill). The parent owns where the composer lives and what closing means.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { askErrorMessage, confirmedDomainFor, parseSentAsk, parseSlotCapReached } from "@/components/ask/askApi";
import { useOnlineStatus } from "@/components/goal";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { clearAskPrefill, readAskPrefill, saveAskPrefill } from "@/lib/askPrefill";
import { discardAskDraftRemote, saveAskDraftRemote, useAskDraft } from "@/lib/askDraftApi";
import { fastTrackAskFields } from "@/lib/fastTrackHandoff";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";
import { useSeekerSetup } from "@/lib/useSeekerSetup";
import { countWords } from "@shared/askQuality";
import type { PublicCompany } from "@shared/companies";
import { askCostLine, CREDIT_ENDED_CAVEAT, type AskCostLine } from "@shared/moneyCopy";
import { COMPANY_CAP_REACHED, companyCapCopy, slotCapNudgeCopy } from "@shared/openAskSlots";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { parseOpportunityAskSearch, type OpportunityAskSearch } from "@shared/companyOpportunities";
import { isValidTargetRoleUrl, jobLinkFitsCompany } from "@shared/referralUrl";
import { composeWhyMe, overLimitReasons, splitWhyMe, WHY_ME_MAX, type WhyMeReasons } from "@shared/whyMe";
import type { AskResume, AskSentView } from "./AskDrawer";
import { askIdempotencyKey, ASK_IDEMPOTENCY_KEY, buildAskBody } from "./askSend";
import { linkHint, roleTitleFromUrl, type LinkHint } from "./findModel";
import { goToSeekerSignIn } from "./signInHandoff";

const MIN_WORDS = 10;

function session(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

function confirmedDomain(url: string): string | undefined {
  try { return confirmedDomainFor(url, localStorage.getItem("bridge-company-confirmation")); } catch { return undefined; }
}

export type AskComposer = {
  signedIn: boolean;
  url: string;
  onUrlChange(value: string): void;
  onUrlBlur(): void;
  hint: LinkHint;
  resumeView: AskResume;
  pickResume(file: File | null): void;
  resumeError: string;
  reasons: WhyMeReasons;
  onReasonChange(index: number, value: string): void;
  reasonsError: string;
  watch: { state: "idle" | "busy" | "done" | "error"; message: string; onWatch(): void } | null;
  cost: AskCostLine;
  context: string | null;
  sendLabel: string;
  sendBusyLabel: string;
  sending: boolean;
  sendBlocked?: string;
  send(): void;
  onSaveDraft: (() => void) | null;
  draftState: "idle" | "saving" | "saved";
  sendError: ReactNode;
  sent: AskSentView | null;
  /** D-022: the posted role this ask opened from, while it still applies. */
  postSelection: OpportunityAskSearch | null;
  /** Fresh form for a new company; the resume carries unless clearResume is set. */
  resetForm(options?: { clearResume?: boolean }): void;
  /** Clear the terminal send view and error after the drawer has closed. */
  clearAfterClose(): void;
};

export function useAskComposer(company: PublicCompany | null): AskComposer {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const balance = useCreditBalance(Boolean(isSignedIn));
  const setup = useSeekerSetup(Boolean(isLoaded && isSignedIn), fetchToken);
  const remoteDraft = useAskDraft(Boolean(isLoaded && isSignedIn), fetchToken);

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
  // A handoff back from sign-in (/ask keeps the link and reasons), and an ask
  // opened from a posted role ("/ask?post=<id>&job=<link>", D-022): the post
  // id travels with the send so the poster sees it first; a fresh form drops it.
  const [prefill] = useState(() => readAskPrefill(session()));
  const [postSelection, setPostSelection] = useState<OpportunityAskSearch | null>(() => parseOpportunityAskSearch(typeof window === "undefined" ? "" : window.location.search));

  // The posted role's link fills an untouched composer, wherever the composer lives.
  useEffect(() => {
    if (postSelection?.jobUrl) setUrl(current => current || postSelection.jobUrl!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A saved draft fills only what is still empty for the company it was written for.
  useEffect(() => {
    if (!remoteDraft || !company || remoteDraft.companySlug !== company.slug) return;
    setUrl(current => current || remoteDraft.targetRoleUrl);
    setReasons(current => (current.some(reason => reason.trim()) ? current : splitWhyMe(remoteDraft.note)));
  }, [remoteDraft, company]);

  // The sign-in handoff prefill does the same on /ask, for its own company.
  useEffect(() => {
    if (!prefill || !company || prefill.companySlug !== company.slug) return;
    setUrl(current => current || prefill.targetRoleUrl);
    setReasons(current => (current.some(reason => reason.trim()) ? current : splitWhyMe(prefill.note)));
  }, [prefill, company]);

  const resumeView: AskResume = resumeFile ? { name: resumeFile.name } : uploaded ? { name: uploaded.fileName } : setup?.resume ? { name: setup.resume.fileName } : null;
  const resumeDoc = uploaded ?? (resumeFile ? null : setup?.resume ?? null);
  const hint = linkHint(url, company, linkTouched || attempted);
  const linkOk = isValidTargetRoleUrl(url.trim()) && (!company || jobLinkFitsCompany(url, company.domains));
  const words = countWords(composeWhyMe(reasons));
  const tooLong = overLimitReasons(reasons).length > 0;
  const cost = askCostLine({ open: company ? company.openToReferrals : null, balance: isSignedIn && balance?.state === "ready" ? balance.count : null });
  const context = company ? [company.name, roleTitleFromUrl(url)].filter(Boolean).join(" · ") : roleTitleFromUrl(url);

  const missing = !linkOk
    ? (hint?.tone === "error" ? hint.text : "Add the official job link first.")
    : isSignedIn && !resumeView ? "Add your resume first."
      : tooLong ? `Keep each reason to ${WHY_ME_MAX} characters.`
        : words < MIN_WORDS ? "Write your reasons first (at least a sentence or two)."
          : null;
  const blocked = !online ? "You’re offline. Sending needs a connection." : isSignedIn ? cost.blockedReason ?? undefined : undefined;

  const resetForm = (options?: { clearResume?: boolean }) => {
    setUrl("");
    setReasons(["", "", ""]);
    setLinkTouched(false);
    setAttempted(false);
    setResumeError("");
    setSendError(null);
    setSent(null);
    setWatch({ state: "idle", message: "" });
    setDraftState("idle");
    setPostSelection(null);
    if (options?.clearResume) { setResumeFile(null); setUploaded(null); }
  };

  const clearAfterClose = () => { setSent(null); setSendError(null); };

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
        opportunityId: postSelection?.opportunityId,
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
      clearAskPrefill(session());
      setPostSelection(null);
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

  return {
    signedIn: Boolean(isSignedIn),
    url,
    onUrlChange: value => { setUrl(value); setDraftState("idle"); },
    onUrlBlur: () => setLinkTouched(true),
    hint,
    resumeView,
    pickResume,
    resumeError: resumeError || (attempted && isSignedIn && !resumeView ? "Add your resume. It’s shared only after a referrer accepts." : ""),
    reasons,
    onReasonChange: (index, value) => {
      setReasons(current => [index === 0 ? value : current[0], index === 1 ? value : current[1], index === 2 ? value : current[2]]);
      setDraftState("idle");
    },
    reasonsError: attempted && words < MIN_WORDS ? "Write your reasons first: one specific result beats a list of skills." : "",
    watch: company && !company.openToReferrals ? { ...watch, onWatch: () => { void watchCompany(); } } : null,
    cost,
    context,
    sendLabel: isSignedIn ? "Send ask" : "Sign in and send",
    sendBusyLabel: sendStage === "resume" ? "Uploading your resume…" : "Sending your ask…",
    sending: sendStage !== "idle",
    sendBlocked: blocked,
    send: () => { void send(); },
    onSaveDraft: isSignedIn ? () => { void saveDraft(); } : null,
    draftState,
    sendError,
    sent,
    postSelection,
    resetForm,
    clearAfterClose,
  };
}
