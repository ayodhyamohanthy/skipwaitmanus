// The ask composer's form state and live send path, shared by the /explore
// directory drawer and the /explore/:slug company page (D-048 phase 3 W2).
// Owns the job link, the three "Why me" reasons (D-077(4)), the resume
// pick/upload, the remote draft, the cost line and the send itself
// (idempotency key, slot and per-company caps, sign-in hand-off with a saved
// prefill). The parent owns where the composer lives and what closing means.
import { useQueryClient } from "@tanstack/react-query";
import { companyDirectoryKeys } from "@/lib/companyDirectory";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import { askErrorMessage, confirmedDomainFor, parsePlanLimit, parseSentAsk, parseSlotCapReached } from "@/components/ask/askApi";
import type { PinnedWorkState } from "@/components/ask/PinnedWorkPicker";
import { useOnlineStatus } from "@/components/goal";
import { useCreditBalance } from "@/hooks/useCreditBalance";
import { useAskQuote } from "@/hooks/useAskQuote";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { ASK_PREFILL_TTL_MS, clearAskPrefill, readAskPrefill, saveAskPrefill } from "@/lib/askPrefill";
import { clearReferralDraft, readReferralDraft } from "@/lib/pwaContinuity";
import { defaultPinnedWorkIds, useAskWorkPieces } from "@/lib/askWorkPieces";
import { discardAskDraftRemote, saveAskDraftRemote, useAskDraft } from "@/lib/askDraftApi";
import { fastTrackAskFields } from "@/lib/fastTrackHandoff";
import { uploadResume, validateResumeFile, type ResumeDoc } from "@/lib/resumeUpload";
import { useSeekerSetup } from "@/lib/useSeekerSetup";
import { countWords } from "@shared/askQuality";
import type { PublicCompany } from "@shared/companies";
import { ADD_CREDITS_HREF, askCostLine, CREDIT_ENDED_CAVEAT, creditUsedPhrase, topUpHref, type AskCostLine } from "@shared/moneyCopy";
import { usePlansCatalog } from "@/components/plans/plansCatalogApi";
import { OPPORTUNITY_FIRST_LOOK_HOURS } from "@shared/companyOpportunities";
import { ASK_LEVEL_COST_CLIENT } from "@/lib/goalFlags";
import { COMPANY_CAP_REACHED, COMPANY_COVERAGE_CHANGED, companyCapCopy, slotCapNudgeCopy } from "@shared/openAskSlots";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { MAX_ASK_WORK_ITEMS } from "@shared/askWorkItems";
import { parseOpportunityAskSearch, type OpportunityAskSearch } from "@shared/companyOpportunities";
import { isValidTargetRoleUrl, jobLinkFitsCompany } from "@shared/referralUrl";
import { composeWhyMe, overLimitReasons, splitWhyMe, WHY_ME_MAX, type WhyMeReasons } from "@shared/whyMe";
import type { AskResume, AskSentView } from "./AskDrawer";
import { askIdempotencyKey, ASK_IDEMPOTENCY_KEY, buildAskBody } from "./askSend";
import { linkHint, roleTitleFromUrl, type AskCostQuote, type LinkHint } from "./findModel";
import { askSignInReturnTo, goToSeekerSignIn } from "./signInHandoff";

const MIN_WORDS = 10;

function session(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

const ASK_TOPUP_SELECTION_KEY = "skipwait-ask-topup-selection";
const askTopUpSelectionSchema = z.strictObject({
  version: z.literal(1),
  userId: z.string().min(1).max(128),
  companySlug: z.string().min(1).max(64).nullable(),
  savedAt: z.number().int().nonnegative(),
  pickedWork: z.array(z.number().int().positive()).max(MAX_ASK_WORK_ITEMS).nullable(),
  uploaded: z.strictObject({ id: z.number().int().positive(), fileName: z.string().min(1).max(255) }).nullable(),
  resumeFile: z.strictObject({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().max(128),
    lastModified: z.number().int().nonnegative(),
    dataUrl: z.string().min(1).max(15 * 1024 * 1024),
  }).nullable(),
}).refine(value => value.pickedWork !== null || value.uploaded !== null || value.resumeFile !== null);

type AskTopUpSelection = z.infer<typeof askTopUpSelectionSchema>;
type RestoredAskTopUpSelection = { resumeFile: File | null; uploaded: ResumeDoc | null; pickedWork: number[] | null; error?: string };

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the selected resume"));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the selected resume"));
    reader.readAsDataURL(file);
  });
}

function fileFromSnapshot(file: NonNullable<AskTopUpSelection["resumeFile"]>): File {
  const comma = file.dataUrl.indexOf(",");
  if (comma < 0 || !/^data:[^,]*;base64$/i.test(file.dataUrl.slice(0, comma))) throw new Error("Invalid resume snapshot");
  const binary = atob(file.dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const restored = new File([bytes], file.fileName, { type: file.mimeType, lastModified: file.lastModified });
  if (validateResumeFile(restored)) throw new Error("Invalid resume snapshot");
  return restored;
}

async function saveAskTopUpSelection(
  store: Storage | null,
  userId: string | null,
  companySlug: string | null,
  resumeFile: File | null,
  uploaded: ResumeDoc | null,
  pickedWork: number[] | null,
): Promise<boolean> {
  const hasSelection = resumeFile !== null || uploaded !== null || pickedWork !== null;
  if (!hasSelection) {
    try { store?.removeItem(ASK_TOPUP_SELECTION_KEY); return true; } catch { return false; }
  }
  if (!store || !userId) return false;
  try {
    store.removeItem(ASK_TOPUP_SELECTION_KEY);
    const resume = resumeFile ? {
      fileName: resumeFile.name,
      mimeType: resumeFile.type,
      lastModified: resumeFile.lastModified,
      dataUrl: await fileAsDataUrl(resumeFile),
    } : null;
    const selection = askTopUpSelectionSchema.parse({
      version: 1,
      userId,
      companySlug,
      savedAt: Date.now(),
      pickedWork,
      uploaded: uploaded ? { id: uploaded.id, fileName: uploaded.fileName } : null,
      resumeFile: resume,
    });
    store.setItem(ASK_TOPUP_SELECTION_KEY, JSON.stringify(selection));
    return true;
  } catch {
    try { store.removeItem(ASK_TOPUP_SELECTION_KEY); } catch { /* storage may be unavailable */ }
    return false;
  }
}

function clearAskTopUpSelection(store: Storage | null): void {
  try { store?.removeItem(ASK_TOPUP_SELECTION_KEY); } catch { /* tab storage may be unavailable */ }
}

function readAskTopUpSelection(
  store: Storage | null,
  userId: string,
  companySlug: string | null,
  pathname: string,
  now: number = Date.now(),
): RestoredAskTopUpSelection | null {
  if (!store) return null;
  let raw: string | null;
  try { raw = store.getItem(ASK_TOPUP_SELECTION_KEY); } catch { return null; }
  if (!raw) return null;
  const clear = () => clearAskTopUpSelection(store);
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    clear();
    return { resumeFile: null, uploaded: null, pickedWork: null, error: "We could not restore your selected resume or work. Your ask details are still here; check your selections before sending." };
  }
  const parsed = askTopUpSelectionSchema.safeParse(value);
  if (!parsed.success) {
    clear();
    return { resumeFile: null, uploaded: null, pickedWork: null, error: "We could not restore your selected resume or work. Your ask details are still here; check your selections before sending." };
  }
  const saved = parsed.data;
  if (saved.userId !== userId || saved.savedAt > now + 60_000 || now - saved.savedAt > ASK_PREFILL_TTL_MS) {
    clear();
    return null;
  }
  if (pathname !== "/ask" && (!companySlug || saved.companySlug !== companySlug)) return null;
  try {
    const restoredFile = saved.resumeFile ? fileFromSnapshot(saved.resumeFile) : null;
    clear();
    return { resumeFile: restoredFile, uploaded: saved.uploaded, pickedWork: saved.pickedWork };
  } catch {
    clear();
    return {
      resumeFile: null,
      uploaded: saved.uploaded,
      pickedWork: saved.pickedWork,
      error: "We could not restore your selected resume. Choose it again; your ask details and work choice are still here.",
    };
  }
}

function confirmedDomain(url: string): string | undefined {
  try { return confirmedDomainFor(url, localStorage.getItem("bridge-company-confirmation")); } catch { return undefined; }
}

// The /start hand-off (todo "Preserve the job link from start through the ask
// form"): Onboarding.begin writes the referral draft and the company
// confirmation binding, then routes through /request to /ask. Only a fresh,
// confirmation-bound draft fills the composer, so a stale, malformed or
// mismatched draft is cleaned up instead of applied; sign-out already destroys
// the hand-off (logoutPrivacy), so it can never reach a different account.
type StartHandoff = { targetUrl: string };

function readStartHandoff(now: number = Date.now()): StartHandoff | null {
  let store: Storage | null = null;
  try { store = typeof window === "undefined" ? null : window.localStorage; } catch { store = null; }
  if (!store) return null;
  const draft = readReferralDraft(store);
  if (!draft) return null;
  let bound = false;
  try {
    const confirmation = JSON.parse(store.getItem("bridge-company-confirmation") || "null") as { canonicalUrl?: unknown } | null;
    bound = typeof confirmation?.canonicalUrl === "string" && confirmation.canonicalUrl === draft.targetUrl;
  } catch { bound = false; }
  if (now - draft.updatedAt > ASK_PREFILL_TTL_MS || !bound) {
    try { store.removeItem("bridge-target-url"); store.removeItem("bridge-company-confirmation"); } catch { /* persistence is best-effort */ }
    clearReferralDraft(store);
    return null;
  }
  return { targetUrl: draft.targetUrl };
}

function clearStartHandoff(): void {
  try {
    localStorage.removeItem("bridge-target-url");
    localStorage.removeItem("bridge-company-confirmation");
  } catch { /* persistence is best-effort */ }
  clearReferralDraft();
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
  /** D-132 item 3 (flag VITE_ASK_LEVEL_COST): the by-level quote for the current link. Null while the flag is off or the quote is pending or failed; the flat one-credit line holds then. */
  costQuote: AskCostQuote | null;
  /** D-132 item 3: set only when the target is a COVERED company and the wallet is short - the primary action becomes the top-up. Uncovered asks wait for free and never swap. */
  topUp: { shortfall: number; href: string } | null;
  onTopUp(event?: React.MouseEvent): void;
  context: string | null;
  sendLabel: string;
  sendBusyLabel: string;
  sending: boolean;
  sendBlocked?: string;
  sendGuidance: string | null;
  creditRecovery: boolean;
  send(): void;
  onSaveDraft: (() => void) | null;
  draftState: "idle" | "saving" | "saved";
  sendError: ReactNode;
  sent: AskSentView | null;
  /** Task 13: the showcase pieces this ask carries, and the picker's state. */
  work: PinnedWorkState;
  /** D-022: the posted role this ask opened from, while it still applies. */
  postSelection: OpportunityAskSearch | null;
  /** D-174: pick a posted role in place. Replaces the whole selection - a
   * linkless pick clears any stale link and identity from an earlier pick. */
  selectPost(selection: OpportunityAskSearch | null): void;
  /** Fresh form for a new company; the resume carries unless clearResume is set. */
  resetForm(options?: { clearResume?: boolean }): void;
  /** Clear the terminal send view and error after the drawer has closed. */
  clearAfterClose(): void;
};

export function useAskComposer(company: PublicCompany | null, options?: { companyDoor?: boolean }): AskComposer {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
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
  // Task 13: the seeker's own showcase, the pieces they pick, and the plan cap
  // the server quotes back if they pick more than it puts in front of a
  // referrer. The picker owns none of this; both surfaces read it here so the
  // drawer and /ask can never send different lists.
  const workPieces = useAskWorkPieces(Boolean(isLoaded && isSignedIn), fetchToken);
  const [pickedWork, setPickedWork] = useState<number[] | null>(null);
  const [pinCap, setPinCap] = useState<number | null>(null);
  const [pinNotice, setPinNotice] = useState("");
  const topUpRestoreAttempted = useRef(false);
  useEffect(() => {
    if (!isLoaded) return;
    const store = session();
    if (!isSignedIn || !userId) {
      clearAskTopUpSelection(store);
      setResumeFile(null);
      setUploaded(null);
      setPickedWork(null);
      return;
    }
    if (topUpRestoreAttempted.current) return;
    const restored = readAskTopUpSelection(store, userId, company?.slug ?? null, typeof window === "undefined" ? "" : window.location.pathname);
    if (!restored) return;
    topUpRestoreAttempted.current = true;
    setResumeFile(restored.resumeFile);
    setUploaded(restored.uploaded);
    if (restored.pickedWork !== null) setPickedWork(restored.pickedWork);
    if (restored.error) {
      setResumeError(restored.error);
      setSendError(restored.error);
    }
  }, [isLoaded, isSignedIn, userId, company?.slug]);
  // Until the seeker touches the picker, the pieces they already pin ride
  // along, up to the transport ceiling. A plan downgrade can leave more pinned
  // pieces than the plan now allows; that case is not pre-empted here (the
  // composer has no plan number) — the first send is refused, and the picker
  // trims to the cap the server quotes. See `send` below.
  const selectedWork = pickedWork ?? defaultPinnedWorkIds(workPieces.pieces, MAX_ASK_WORK_ITEMS);
  const workLimit = Math.min(pinCap ?? MAX_ASK_WORK_ITEMS, MAX_ASK_WORK_ITEMS);
  const toggleWork = (id: number) => {
    const base = pickedWork ?? defaultPinnedWorkIds(workPieces.pieces, MAX_ASK_WORK_ITEMS);
    if (base.includes(id)) { setPickedWork(base.filter(value => value !== id)); setPinNotice(""); return; }
    // Refusing a pick says why: a silent no-op looks like a broken control.
    if (base.length >= workLimit) {
      setPinNotice(`This plan puts ${workLimit === 1 ? "1 piece" : `${workLimit} pieces`} of work in front of a referrer — unpin one to swap it.`);
      return;
    }
    setPickedWork([...base, id]);
    setPinNotice("");
  };
  // A handoff back from sign-in (/ask keeps the link and reasons), and an ask
  // opened from a posted role ("/ask?post=<id>&job=<link>", D-022): the post
  // id travels with the send so the poster sees it first; a fresh form drops it.
  const [prefill] = useState(() => readAskPrefill(session()));
  const [startHandoff] = useState(() => readStartHandoff());
  const [postSelection, setPostSelection] = useState<OpportunityAskSearch | null>(() => parseOpportunityAskSearch(typeof window === "undefined" ? "" : window.location.search));

  // The posted role's link fills an untouched composer, wherever the composer lives.
  useEffect(() => {
    if (postSelection?.jobUrl) setUrl(current => current || postSelection.jobUrl!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D-174 in-place pick from a door: the selection is REPLACED, never merged -
  // a linkless post clears the previous post's link so no stale link, pass
  // check or opportunity id can leak into the next ask.
  const selectPost = (selection: OpportunityAskSearch | null) => {
    if (selection === null && postSelection === null) return;
    setPostSelection(selection);
    if (selection) {
      setUrl(selection.jobUrl ?? "");
    } else {
      setUrl(remoteDraft && company && remoteDraft.companySlug === company.slug ? remoteDraft.targetRoleUrl : "");
    }
    setDraftState("idle");
  };

  // A saved draft fills only what is still empty for the company it was written for.
  useEffect(() => {
    if (!remoteDraft || !company || remoteDraft.companySlug !== company.slug) return;
    setUrl(current => current || remoteDraft.targetRoleUrl);
    setReasons(current => (current.some(reason => reason.trim()) ? current : splitWhyMe(remoteDraft.note)));
  }, [remoteDraft, company]);

  // /ask restores the handoff even without a directory match. Other surfaces
  // still accept only a prefill belonging to their own resolved company.
  useEffect(() => {
    if (!prefill || (window.location.pathname !== "/ask" && (!company || prefill.companySlug !== company.slug))) return;
    setUrl(current => current || prefill.targetRoleUrl);
    setReasons(current => (current.some(reason => reason.trim()) ? current : splitWhyMe(prefill.note)));
    if (prefill.opportunityId) {
      setPostSelection(current => (current ? { ...current, opportunityId: prefill.opportunityId! } : { opportunityId: prefill.opportunityId!, jobUrl: prefill.targetRoleUrl || null }));
    }
  }, [prefill, company]);

  // Lowest fill precedence: the /start hand-off fills only the still-empty
  // link, on /ask or where the link fits the resolved company. The account
  // draft, the posted role and the sign-in/session prefill all outrank it.
  useEffect(() => {
    if (!startHandoff) return;
    if (window.location.pathname !== "/ask" && !(company && jobLinkFitsCompany(startHandoff.targetUrl, company.domains))) return;
    setUrl(current => current || startHandoff.targetUrl);
  }, [startHandoff, company]);

  const resumeView: AskResume = resumeFile ? { name: resumeFile.name } : uploaded ? { name: uploaded.fileName } : setup?.resume ? { name: setup.resume.fileName } : null;
  const resumeDoc = uploaded ?? (resumeFile ? null : setup?.resume ?? null);
  const hint = linkHint(url, company, linkTouched || attempted);
  const linkOk = isValidTargetRoleUrl(url.trim()) && (!company || jobLinkFitsCompany(url, company.domains));
  const words = countWords(composeWhyMe(reasons));
  const tooLong = overLimitReasons(reasons).length > 0;
  // D-132 item 3 (flag VITE_ASK_LEVEL_COST): the single shared by-level quote
  // for /ask, the drawer and the door — one fetch per validated link, and only
  // for a signed-in seeker. Pending or failed keeps the flat one-credit line,
  // exactly like flag-off. With a quote the server's numbers win: its
  // totalAvailable and shortfall are the true wallet position, so the cost
  // line and the top-up can never disagree.
  const askLevelCostOn = ASK_LEVEL_COST_CLIENT;
  const quoteState = useAskQuote(url, askLevelCostOn && linkOk);
  const quote = quoteState.status === "ready" ? quoteState.quote : null;
  // Flag on with a valid link at a COVERED company (or coverage not yet
  // resolved): Send waits for the price, because the server charges the level
  // cost at submit there. A pending or failed quote can never fall back to
  // the flat one-credit line or leave Send enabled. A company known NOT open
  // is different by contract (QA-verified): the server accepts the ask into
  // coverage-wait with NO debit even when the wallet is short, so the flat
  // "no credit used until…" line is the truth and Send never waits on pricing.
  const covered = company?.openToReferrals === true;
  const uncovered = company?.openToReferrals === false;
  const gated = quoteState.status === "pending" || quoteState.status === "error";
  const cost: AskCostLine = gated && uncovered
    ? askCostLine({ open: false, balance: null, cost: null })
    : quoteState.status === "pending"
      ? { line: "Pricing this ask…", detail: "Send unlocks when the price is in.", blockedReason: "Pricing this ask…" }
      : quoteState.status === "error"
        ? { line: "We could not price this ask", detail: "Edit the job link to try again.", blockedReason: "We could not price this ask" }
        : askCostLine({ open: company ? company.openToReferrals : null, balance: quote ? quote.totalAvailable : isSignedIn && balance?.state === "ready" ? balance.count : null, cost: quote?.cost ?? (askLevelCostOn ? undefined : 1) });
  // The shortfall top-up swap applies only at a covered company: an uncovered
  // ask waits for free by contract, so a short wallet must never be pushed to
  // top-up for it. Coverage unknown (no directory match) keeps Send on the
  // line's wording; the server refuses covered-and-short submits with the
  // exact wording shown in the send error, and the composer re-prices then.
  // Only the by-level quote ever needs the pack catalog (top-up destination);
  // with the flag off there is no quote and no top-up, so the composer makes
  // no billing read at all - flags off stays byte-for-byte today's network
  // behaviour (review F3, 55e5aa3a).
  const catalogQuery = usePlansCatalog(Boolean(isSignedIn) && askLevelCostOn);
  const catalog = catalogQuery.data ?? null;
  const packsOnSale = catalog !== null ? catalog.packs.some(pack => pack.available) : true;
  const resolvedTopUpHref = topUpHref(packsOnSale);
  const topUp = quote && covered && quote.shortfall > 0 ? { shortfall: quote.shortfall, href: resolvedTopUpHref } : null;
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
    setPickedWork(null);
    setPinCap(null);
    setPinNotice("");
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
      // Save the seeker's work even when the directory cannot resolve the company.
      saveAskPrefill({
        companySlug: company?.slug ?? null,
        targetRoleUrl: url,
        note: composeWhyMe(reasons),
        opportunityId: postSelection?.opportunityId,
      });
      goToSeekerSignIn(askSignInReturnTo(window.location.pathname, window.location.search, postSelection, { companyDoor: options?.companyDoor === true }));
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
        workItemIds: selectedWork,
        // Review F2 (55e5aa3a): expectedCoverage exists only for the by-level
        // quote's free-waiting promise. With VITE_ASK_LEVEL_COST off the
        // composer shows today's flat line and sends today's body, so a
        // coverage flip at commit keeps today's behaviour (created, 1 credit
        // spent) instead of a 409 the live path never promised.
        expectedCoverage: askLevelCostOn && uncovered ? "waiting_for_company_coverage" : undefined,
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
      // D-132 item 3: we showed "no credit used until a verified employee can
      // see it", but the company opened up before the commit. The server
      // created nothing and charged nothing; re-read the directory and the
      // quote so the covered cost line (and any top-up) is live, and the
      // seeker sends again only after seeing the real price.
      if (response.status === 409 && payload.code === COMPANY_COVERAGE_CHANGED) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: companyDirectoryKeys.all }),
          queryClient.invalidateQueries({ queryKey: ["ask-quote"] }),
        ]);
        setSendError(typeof payload.error === "string" ? payload.error : "The cost changed before sending. Nothing was sent and nothing was charged - check the live price and send again if it works for you.");
        return;
      }
      // Task 13: more pinned work than the plan puts in front of a referrer. The
      // server quoted the cap; trim the picker to it and retire the submission
      // key, because the corrected ask is a different body and must not replay
      // against one that was never created. Nothing was charged, no ask exists.
      const pinLimit = parsePlanLimit(response.status, payload);
      if (pinLimit?.limit === "showcase_pins") {
        setPinCap(pinLimit.cap);
        setPickedWork(selectedWork.slice(0, pinLimit.cap));
        setPinNotice(`Kept the first ${pinLimit.cap === 1 ? "piece" : `${pinLimit.cap} pieces`}. Tap another to swap it in.`);
        session()?.removeItem(ASK_IDEMPOTENCY_KEY);
        setSendError(typeof payload.error === "string" ? payload.error : "Your plan puts fewer pieces of work in front of a referrer. Unpin one and send again.");
        return;
      }
      const created = response.ok ? parseSentAsk(payload) : null;
      if (!created) throw new Error(typeof payload.error === "string" ? payload.error : "We could not send this ask");
      session()?.removeItem(ASK_IDEMPOTENCY_KEY);
      clearAskPrefill(session());
      clearAskTopUpSelection(session());
      clearStartHandoff();
      setPostSelection(null);
      void discardAskDraftRemote(fetchToken);
      const name = company?.name ?? created.companyDomain ?? "the company";
      const where = created.companyDomain ? `${created.companyDomain} ` : "";
      setSent({
        company: name,
        detail: created.fastTrack
          ? `Only the ${where}employee whose link you used will see it. If they don’t pick it up within ${ASK_TTL_DAYS} days, it closes and the credit comes back, ${CREDIT_ENDED_CAVEAT}.`
          : created.waitingForCoverage
            ? `No verified employee there can see it yet, so nothing was spent. It waits for free up to ${COVERAGE_WAIT_DAYS} days: when one can see it, ${creditUsedPhrase(ASK_LEVEL_COST_CLIENT)} and it goes live; ${ASK_LEVEL_COST_CLIENT ? "if you do not have enough then, we hold it until you add more." : "if you have no credit then, we hold it until you add one."}`
            : created.firstLook
              ? `The employee who posted this role sees your ask first. If they pass, or don’t accept within ${OPPORTUNITY_FIRST_LOOK_HOURS} hours, other verified ${where}employees can see it. If nobody picks it up within ${ASK_TTL_DAYS} days, it closes and the credit comes back, ${CREDIT_ENDED_CAVEAT}; once someone picks it up, the credit stays spent.`
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
      // The server is the balance authority at commit; after a refusal the
      // snapshot the composer priced against may be stale, so re-price.
      void queryClient.invalidateQueries({ queryKey: ["ask-quote"] });
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

  const onTopUp = async (event?: React.MouseEvent) => {
    event?.preventDefault();
    setSendError(null);
    const store = session();
    const selectionsSaved = await saveAskTopUpSelection(store, userId ?? null, company?.slug ?? null, resumeFile, uploaded, pickedWork);
    if (!selectionsSaved) {
      setSendError("We could not save your selected resume or work. Your ask is still here. Try again.");
      return;
    }
    if (!saveAskPrefill({ companySlug: company?.slug ?? null, targetRoleUrl: url, note: composeWhyMe(reasons), opportunityId: postSelection?.opportunityId }, store)) {
      clearAskTopUpSelection(store);
      setSendError("We could not save your ask before opening credits. Your ask is still here. Try again.");
      return;
    }
    if (isSignedIn && company && isValidTargetRoleUrl(url.trim())) {
      try {
        await saveAskDraftRemote({ companySlug: company.slug, targetRoleUrl: url.trim(), note: composeWhyMe(reasons) }, fetchToken);
      } catch (reason) {
        setSendError(reason instanceof Error ? reason.message : "We could not save your draft. Try again.");
        return;
      }
    }
    navigate(topUp?.href ?? resolvedTopUpHref);
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
    costQuote: quote,
    topUp,
    onTopUp: (event?: React.MouseEvent) => { void onTopUp(event); },
    context,
    sendLabel: isSignedIn ? "Send ask" : "Sign in and send",
    sendBusyLabel: sendStage === "resume" ? "Uploading your resume…" : "Sending your ask…",
    sending: sendStage !== "idle",
    sendBlocked: blocked,
    sendGuidance: !online ? blocked ?? null : cost.blockedReason && isSignedIn ? "Your balance is too low to send this referral request." : url.trim() && linkOk ? missing : null,
    creditRecovery: online && Boolean(isSignedIn && cost.blockedReason),
    send: () => { void send(); },
    onSaveDraft: isSignedIn ? () => { void saveDraft(); } : null,
    draftState,
    sendError,
    sent,
    work: {
      pieces: workPieces.pieces,
      state: workPieces.state,
      selected: selectedWork,
      limit: workLimit,
      notice: pinNotice,
      reload: workPieces.reload,
      toggle: toggleWork,
    },
    postSelection,
    selectPost,
    resetForm,
    clearAfterClose,
  };
}
