// Goal /referrer (D-048-p3-referrer; packet docs/plans/D-048-referrer.md).
// Goal-first rebuild of the kit referrer workspace: one goal (open doors on
// your terms), one black commit, identity private until acceptance.
// Sign-in stays work-email OTP only: the dialog hosts the goal GoalOtpSignIn,
// and other doors verify through /verify. The server's verified-referrer
// verdict (useReferrerAccess) gates every private read - never the sign-in
// account's email domain, which misses a Google session that verified a work
// email by code. Orchestration (OTP enrollment, post-sign-in landing, claimed
// review) mirrors the kit page effect-for-effect; the claimed-request review
// reuses the kit's privacy-pinned ClaimedReview/DecisionRecorded read-only
// (D-019).
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, Check, ChevronDown, EyeOff, MailCheck, Pause, Settings2, ShieldCheck, UserRound, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { GoalButton, GoalErrorState, GoalNextStep, GoalSkeletonRows } from "@/components/goal";
import { coverageInviteSessionKey } from "@/components/WorkEmailSignIn";
import { ReferralCoverageInviteBanner } from "@/components/referrer/CoverageInviteBanner";
import { consumeReferrerOtpLanding, markReferrerOtpLanding } from "@/components/referrer/ReferrerSignInDialog";
import { ClaimedReview, DecisionRecorded, ReviewFrame, type ClaimedCompanyRequest } from "@/components/referrer/ClaimedReview";
import { CAPACITY_MAX, CAPACITY_MIN, WORK_FUNCTIONS, capacitySettingsKey, fetchCapacitySettings, orderAreas, saveCapacitySettings, type CapacitySettings, type TokenSource } from "@/components/referrer/capacitySettingsData";
import { saveReferrerPreferences } from "@/components/referrer-home/referrerData";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { GoalOtpSignIn } from "./GoalOtpSignIn";

type CompanyResponse = { error?: string; reward?: { rewarded?: boolean }; request?: ClaimedCompanyRequest };
type View = "overview" | "setup";
const alertClass = "rounded-[10px] border border-g-hairline p-3 text-g-small text-g-ink";

function Kicker({ children }: { children: string }) {
  return <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{children}</p>;
}

const WORKSPACE_LINKS: ReadonlyArray<{ id: View | "queue"; label: string; href: string }> = [
  { id: "overview", label: "Overview", href: "/referrer" },
  { id: "queue", label: "Request queue", href: "/queue" },
  { id: "setup", label: "Setup & capacity", href: "/referrer?view=setup" },
] as const;

/** Workspace navigation is links, not tabs: each view is a real page. */
export function GoalWorkspaceNav({ view }: { view?: View }) {
  return (
    <nav aria-label="Referrer workspace" className="flex flex-wrap gap-2">
      {WORKSPACE_LINKS.map(item => (
        <Link key={item.id} href={item.href} aria-current={view === item.id ? "page" : undefined} className={`inline-flex h-9 items-center rounded-g-control border px-3 text-g-label transition-colors ${view === item.id ? "border-g-ink font-semibold text-g-ink" : "border-g-hairline text-g-ink-2 hover:border-g-control-edge hover:text-g-ink"}`}>{item.label}</Link>
      ))}
    </nav>
  );
}

function GoalOverview({ onPreviewAsks }: { onPreviewAsks: () => void }) {
  return (
    <section className="mt-6 grid gap-4">
      <div className="max-w-[640px]">
        <GoalNextStep>
          <p className="mt-2 text-g-body font-semibold text-g-ink">Help when the fit feels right.</p>
          <p className="mt-1 text-g-small leading-[1.6] text-g-ink-2">You decide your pace, your criteria, and every introduction. Passing is private and always okay.</p>
          <div className="mt-4"><GoalButton variant="primary" onClick={onPreviewAsks}>Preview incoming referral requests<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton></div>
        </GoalNextStep>
      </div>
      <ul className="grid max-w-[640px] gap-2">
        {([[ShieldCheck, "Your identity stays private", "Revealed only after you accept."], [Settings2, "Set a real capacity", "Pause or change it at any time."], [EyeOff, "No public ratings", "Kindness is not a performance metric."]] as const).map(([Icon, title, sub]) => (
          <li key={title} className="flex items-center gap-3 rounded-[10px] border border-g-hairline px-4 py-3">
            <Icon className="h-4 w-4 shrink-0 text-g-ink-2" aria-hidden="true" />
            <span><strong className="block text-g-label text-g-ink">{title}</strong><span className="block text-g-meta text-g-ink-3">{sub}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The one commit for a signed-in account the server has not verified yet. */
function GoalVerifyGate() {
  return (
    <section className="mt-6 max-w-[640px]">
      <GoalNextStep reason="Confirm a company email with a one-time code to see the request, resume, and forwardable note. Your identity stays private until you accept.">
        <div className="mt-4"><GoalButton variant="primary" asChild><Link href="/verify">Verify your work email<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton></div>
      </GoalNextStep>
    </section>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab/Shift+Tab inside an open dialog so background actions stay unreachable. */
function trapTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (active === last || !container.contains(active))) { event.preventDefault(); first.focus(); }
}

function GoalSignInDialog({ inviteCompany, inviteCode, onClose }: { inviteCompany?: string; inviteCode?: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    markReferrerOtpLanding(true);
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") { trapTab(event, dialogRef.current); return; }
      if (event.key !== "Escape") return;
      markReferrerOtpLanding(false);
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const close = () => { markReferrerOtpLanding(false); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-g-scrim p-5" onClick={close}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="goal-referrer-sign-in-title" onClick={event => event.stopPropagation()} className="relative max-h-[calc(100dvh-40px)] w-full max-w-[440px] overflow-y-auto rounded-[10px] border border-g-hairline bg-g-surface p-6 outline-none gdesk:p-8">
        <button type="button" aria-label="Close setup" onClick={close} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-g-control text-g-ink-2 hover:bg-g-surface-hover hover:text-g-ink"><X className="h-4 w-4" aria-hidden="true" /></button>
        <Kicker>REFERRER SETUP</Kicker>
        {inviteCompany ? <div className="mt-4"><ReferralCoverageInviteBanner companyDomain={inviteCompany} inviteCode={inviteCode} /></div> : null}
        <div className="mt-5">
          <MailCheck className="h-5 w-5 text-g-ink" aria-hidden="true" />
          <h2 id="goal-referrer-sign-in-title" className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Verify work email.</h2>
          <p className="mb-3 mt-2 text-g-small leading-[1.6] text-g-ink-2">This confirms access to a company email address - not employment or employer endorsement.</p>
        </div>
        <GoalOtpSignIn />
      </section>
    </div>
  );
}

const SETUP_LAST_STEP = 2;
function GoalSetupDialog({ initialStep = 0, onClose }: { initialStep?: number; onClose: () => void }) {
  const { getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: capacitySettingsKey, queryFn: () => fetchCapacitySettings(fetchToken), retry: false });
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), SETUP_LAST_STEP));
  const [picked, setPicked] = useState("");
  const area = picked || settings.data?.areas[0] || WORK_FUNCTIONS[0];
  const save = useMutation({
    mutationFn: (saved: readonly string[]) => saveReferrerPreferences(fetchToken, { preferAreas: orderAreas(area, saved) }),
    onSuccess: () => {
      for (const queryKey of [capacitySettingsKey, ["referrer-home"], ["referrer-setup"]]) void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") { trapTab(event, dialogRef.current); return; }
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const domain = settings.data?.companyDomain ?? null;
  const finish = () => {
    if (save.isPending) return;
    if (!settings.data) { void settings.refetch(); return; }
    save.mutate(settings.data.areas);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-g-scrim p-5" onClick={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="relative max-h-[calc(100dvh-40px)] w-full max-w-[440px] overflow-y-auto rounded-[10px] border border-g-hairline bg-g-surface p-6 outline-none gdesk:p-8" role="dialog" aria-modal="true" aria-labelledby="goal-setup-title" onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Close setup" onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-g-control text-g-ink-2 hover:bg-g-surface-hover hover:text-g-ink"><X className="h-4 w-4" aria-hidden="true" /></button>
        <Kicker>{`REFERRER SETUP · ${step + 1} OF 3`}</Kicker>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">{[0, 1, 2].map(index => <span key={index} className={`h-0.5 flex-1 rounded-full ${index <= step ? "bg-g-ink" : "bg-g-hairline"}`} />)}</div>
        {step === 0 ? (
          <div className="mt-5">
            <UserRound className="h-5 w-5 text-g-ink" aria-hidden="true" />
            <h2 id="goal-setup-title" className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Your private profile.</h2>
            <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Your name is not listed publicly. Seekers see the company, not who refers.</p>
            <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-g-hairline p-3"><span className="grid h-9 w-9 place-items-center rounded-[8px] border border-g-hairline font-g-mono text-[13px]">?</span><span><strong className="block text-g-label">Verified person inside</strong><span className="block text-g-meta text-g-ink-3">Identity shown after acceptance</span></span></div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="mt-5">
            <MailCheck className="h-5 w-5 text-g-ink" aria-hidden="true" />
            <h2 id="goal-setup-title" className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Verify work email.</h2>
            <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">This confirms access to a company email address - not employment or employer endorsement.</p>
            {settings.isPending ? (
              <p role="status" className="mt-4 text-g-small text-g-ink-2">Checking your work email…</p>
            ) : domain ? (
              <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-g-hairline p-3" role="status"><BadgeCheck className="h-5 w-5 shrink-0 text-g-ink" aria-hidden="true" /><span><strong className="block text-g-label">Verified · {settings.data?.companyName ?? domain}</strong><span className="block text-g-meta text-g-ink-3">Work email confirmed for {domain}</span></span></div>
            ) : (
              <div className="mt-4"><GoalButton variant="outline" asChild><Link href="/verify">Verify with a one-time code<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></GoalButton></div>
            )}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="mt-5">
            <BriefcaseBusiness className="h-5 w-5 text-g-ink" aria-hidden="true" />
            <h2 id="goal-setup-title" className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Choose your lane.</h2>
            <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">Pick the kinds of roles you can assess and how many referral requests you want to receive.</p>
            <label className="mt-4 block text-g-label text-g-ink">Function
              <span className="relative mt-2 block"><select className="h-(--g-control-h) w-full appearance-none rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink outline-none focus:border-g-ink" value={area} onChange={event => { setPicked(event.target.value); if (save.isError) save.reset(); }}>{WORK_FUNCTIONS.map(item => <option key={item} value={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-g-ink-3" aria-hidden="true" /></span>
            </label>
            {settings.isError ? <p role="alert" className={`mt-3 ${alertClass}`}>{settings.error.message || "We could not load your referrer settings."} Finish tries again.</p> : null}
            {save.isError ? <p role="alert" className={`mt-3 ${alertClass}`}>{save.error.message || "We could not save your referrer settings."}</p> : null}
          </div>
        ) : null}
        <footer className="mt-6 flex justify-between gap-3">
          {step > 0 ? <GoalButton variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</GoalButton> : <span />}
          {step < SETUP_LAST_STEP
            ? <GoalButton variant="primary" onClick={() => setStep(step + 1)}>Continue<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton>
            : <GoalButton variant="primary" busy={save.isPending || settings.isFetching} busyLabel="Saving…" onClick={finish}>Finish<Check className="h-4 w-4" aria-hidden="true" /></GoalButton>}
        </footer>
      </section>
    </div>
  );
}

const VERIFY_ANOTHER = "verify-another";
function GoalCapacityForm({ initial, getToken }: { initial: CapacitySettings; getToken: TokenSource }) {
  const queryClient = useQueryClient();
  const [, go] = useLocation();
  const [area, setArea] = useState(initial.areas[0] ?? "");
  const [capacity, setCapacity] = useState(initial.capacity);
  const [paused, setPaused] = useState(initial.paused);
  const [savedAreas, setSavedAreas] = useState(initial.areas);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => saveCapacitySettings(getToken, { preferAreas: orderAreas(area, savedAreas), referralCapacity: capacity, paused }),
    onSuccess: next => {
      setSavedAreas(next.areas);
      setCapacity(next.capacity);
      setPaused(next.paused);
      setSaved(true);
      queryClient.setQueryData<CapacitySettings>(capacitySettingsKey, current => (current ? { ...current, ...next } : current));
    },
  });
  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setSaved(false); setter(value); };
  const selectClass = "h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink outline-none focus:border-g-ink";
  return (
    <form className="grid gap-4 rounded-[10px] border border-g-hairline p-5" onSubmit={event => { event.preventDefault(); setSaved(false); save.mutate(); }}>
      <label className="grid gap-2 text-g-label text-g-ink">Company
        <select className={selectClass} value={initial.companyDomain ?? ""} onChange={event => { if (event.target.value === VERIFY_ANOTHER) go("/verify"); }}>
          {initial.companyDomain ? <option value={initial.companyDomain}>{initial.companyName ?? initial.companyDomain}</option> : <option value="" disabled>Select your company</option>}
          <option value={VERIFY_ANOTHER}>{initial.companyDomain ? "Verify another company" : "Verify your company"}</option>
        </select>
      </label>
      {initial.companyDomain ? null : <p className="-mt-2 text-g-meta text-g-ink-3">No verified work email yet. <Link href="/verify" className="font-semibold text-g-ink underline underline-offset-2">Verify work email</Link></p>}
      <label className="grid gap-2 text-g-label text-g-ink">Work function
        <select className={selectClass} value={area} onChange={event => edit(setArea)(event.target.value)}>
          <option value="">Choose a function</option>
          {WORK_FUNCTIONS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-g-label text-g-ink"><span>Monthly request capacity <strong>{capacity}</strong></span>
        <input type="range" min={CAPACITY_MIN} max={CAPACITY_MAX} value={capacity} onChange={event => edit(setCapacity)(Number(event.target.value))} className="accent-g-ink" />
      </label>
      <button type="button" aria-pressed={paused} onClick={() => edit(setPaused)(!paused)} className="flex items-center justify-between gap-3 rounded-[10px] border border-g-hairline p-4 text-left">
        <span className="flex items-center gap-3"><Pause className="h-4 w-4 text-g-ink-2" aria-hidden="true" /><span><strong className="block text-g-label text-g-ink">Pause new requests</strong><span className="block text-g-meta text-g-ink-3">Existing conversations stay available.</span></span></span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${paused ? "bg-g-ink" : "bg-g-hairline"}`}><i className={`absolute top-0.5 block h-4 w-4 rounded-full bg-g-on-primary transition-all ${paused ? "left-[18px]" : "left-0.5"}`} /></span>
      </button>
      {save.isError ? <p role="alert" className={alertClass}>{save.error.message}</p> : null}
      <div><GoalButton variant="primary" type="submit" busy={save.isPending} busyLabel="Saving…">Save settings<Check className="h-4 w-4" aria-hidden="true" /></GoalButton></div>
      <span role="status" className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">{saved ? `SETTINGS SAVED${paused ? " · NEW REQUESTS PAUSED" : ""}` : "PAUSED REFERRERS GET NO NEW REVIEW EMAILS"}</span>
    </form>
  );
}

export function GoalCapacityPanel({ isSignedIn, getToken, onSignIn }: { isSignedIn: boolean; getToken: TokenSource; onSignIn: () => void }) {
  const settings = useQuery({ queryKey: capacitySettingsKey, enabled: isSignedIn, retry: false, queryFn: () => fetchCapacitySettings(getToken) });
  return (
    <section className="mt-6 grid max-w-[640px] gap-4" data-skipwait-screen="referrer-setup-capacity">
      <div>
        <Kicker>AVAILABILITY</Kicker>
        <h2 className="mt-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Protect your time.</h2>
        <p className="mt-1 text-g-small text-g-ink-2">Set clear boundaries before requests arrive. Change or pause them at any time.</p>
      </div>
      {!isSignedIn ? (
        <div className="grid gap-3 rounded-[10px] border border-g-hairline p-5">
          <strong className="text-g-label text-g-ink">Sign in with your work email to set your capacity.</strong>
          <p className="text-g-small text-g-ink-2">Capacity and pause apply to private requests at the company you verify.</p>
          <div><GoalButton variant="outline" onClick={onSignIn}>Use company email<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton></div>
        </div>
      ) : settings.isPending ? (
        <GoalSkeletonRows density="company" count={3} />
      ) : settings.isError ? (
        <GoalErrorState title="We couldn’t load your settings" body={`${settings.error.message} Nothing changed. Your capacity and pause are as you left them.`} retry={{ label: settings.isFetching ? "Trying again…" : "Try again", onClick: () => { void settings.refetch(); } }} />
      ) : (
        <GoalCapacityForm initial={settings.data} getToken={getToken} />
      )}
    </section>
  );
}

export default function GoalReferrer() {
  const [, go] = useLocation();
  const params = new URLSearchParams(useSearch());
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const queryClient = useQueryClient();
  const access = useReferrerAccess();
  const verified = access.status === "verified";
  const inviteCompany = params.get("company")?.trim().toLowerCase() || "";
  const inviteCode = params.get("invite")?.trim() || "";
  const claimedRequestId = Number(params.get("request"));
  const hasClaimedRequestId = Number.isInteger(claimedRequestId) && claimedRequestId > 0;
  const view: View = params.get("view") === "setup" ? "setup" : "overview";
  const safeReturnTo = params.get("returnTo") === "/post-opportunity" ? "/post-opportunity" : "";
  const wantsSignIn = Boolean(inviteCompany || params.get("setup") === "work-email" || safeReturnTo || hasClaimedRequestId);
  const employeeSignInEmail = typeof window === "undefined" ? "" : window.sessionStorage.getItem("skipwait:employee-sign-in-email")?.trim().toLowerCase() || "";
  const [signInOpen, setSignInOpen] = useState(wantsSignIn);
  const [signInDismissed, setSignInDismissed] = useState(false);
  const [setupStep, setSetupStep] = useState<number | null>(null);
  const [decision, setDecision] = useState<"" | "approved" | "passed">("");
  const [deciding, setDeciding] = useState(false);
  const [message, setMessage] = useState("");
  const [activeDocument, setActiveDocument] = useState(0);
  const [inboxReady, setInboxReady] = useState(false);
  const [claimedRequest, setClaimedRequest] = useState<ClaimedCompanyRequest | null>(null);
  const [inboxError, setInboxError] = useState("");
  const [workEmailError, setWorkEmailError] = useState("");
  const [coverageRewardMessage, setCoverageRewardMessage] = useState("");
  const [employeeEnrollmentReady, setEmployeeEnrollmentReady] = useState(false);

  useEffect(() => {
    applySeo({ title: "Verify a work email to review private referrals", description: "Verify a company email once, then review private referral requests for your own company and choose whether to help. Reviewing never costs you anything.", path: "/referrer" });
  }, []);
  useEffect(() => {
    if (isLoaded !== false && !isSignedIn && !signInDismissed && view !== "setup") setSignInOpen(true);
  }, [isLoaded, isSignedIn, signInDismissed, view]);
  useEffect(() => { if (params.get("setup") === "work-email" && view === "overview" && isSignedIn) setSetupStep(1); }, [isSignedIn, view]);

  const companyFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    const response = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, credentials: "include" });
    const payload = await readApiJson<CompanyResponse>(response, "We could not complete that private company request");
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };

  useEffect(() => {
    if (!isSignedIn) { setEmployeeEnrollmentReady(false); return; }
    if (!employeeSignInEmail) { setEmployeeEnrollmentReady(true); return; }
    let active = true;
    const savedInviteCode = typeof window === "undefined" ? "" : window.sessionStorage.getItem(coverageInviteSessionKey) || "";
    setEmployeeEnrollmentReady(false);
    void companyFetch("/api/company-referrals/verify-work-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: employeeSignInEmail, inviteCode: savedInviteCode || undefined }) }).then(payload => {
      if (!active) return;
      // D-055: a completed coverage invite rewards the inviting job seeker only; skipwait.me never pays referrers.
      if (payload.reward?.rewarded) setCoverageRewardMessage("You joined from an invite. The person who invited you gets one referral after their next referral request reaches a referrer. skipwait.me never pays referrers.");
      if (savedInviteCode) window.sessionStorage.removeItem(coverageInviteSessionKey);
      setWorkEmailError("");
      // The enrollment is what makes this person verified: re-read the server verdict.
      void queryClient.invalidateQueries({ queryKey: ["referrer-access"] });
    }).catch(error => { if (active) setWorkEmailError(error instanceof Error ? error.message : "We could not confirm this company email for private referral access."); }).finally(() => { if (active) setEmployeeEnrollmentReady(true); });
    return () => { active = false; };
  }, [isSignedIn, employeeSignInEmail, queryClient]);

  useEffect(() => {
    if (!isSignedIn || !verified || claimedRequest || !employeeEnrollmentReady || (view === "setup" && !hasClaimedRequestId)) return;
    let active = true;
    const path = hasClaimedRequestId ? `/api/company-referrals/${claimedRequestId}` : "/api/company-referrals/inbox";
    void companyFetch(path).then(payload => {
      if (!active) return;
      if (hasClaimedRequestId) { setClaimedRequest(payload.request || null); setActiveDocument(0); }
    }).catch((error: unknown) => {
      if (!active) return;
      if (hasClaimedRequestId) setInboxError("This private request is not available to your verified employee account.");
      else setInboxError(error instanceof Error ? error.message : "We could not load private company requests.");
    }).finally(() => { if (active) setInboxReady(true); });
    return () => { active = false; };
  }, [isSignedIn, verified, claimedRequest, claimedRequestId, employeeEnrollmentReady, hasClaimedRequestId, view]);

  useEffect(() => {
    if (!isSignedIn || !verified || !inboxReady || claimedRequest || hasClaimedRequestId || inboxError || view !== "overview") return;
    if (employeeSignInEmail || safeReturnTo || consumeReferrerOtpLanding()) go(safeReturnTo || "/inbox");
  }, [claimedRequest, employeeSignInEmail, go, hasClaimedRequestId, inboxError, inboxReady, isSignedIn, safeReturnTo, verified, view]);

  const decide = async (approved: boolean) => {
    if (!claimedRequest || deciding) return;
    setDeciding(true); setInboxError("");
    try {
      await companyFetch(`/api/company-referrals/${claimedRequest.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: approved ? "approved" : "declined", message: message.trim() || undefined }) });
      setDecision(approved ? "approved" : "passed");
    } catch (error) { setInboxError(error instanceof Error ? error.message : "We could not record this referral decision"); }
    finally { setDeciding(false); }
  };

  if (decision) return <DecisionRecorded decision={decision} request={claimedRequest} onMessage={requestId => go(`/conversation/${requestId}?from=inbox`)} />;

  if (isSignedIn && verified && hasClaimedRequestId) {
    if (claimedRequest) return <ClaimedReview request={claimedRequest} activeDocument={activeDocument} setActiveDocument={setActiveDocument} message={message} setMessage={setMessage} deciding={deciding} error={inboxError} onDecide={approved => { void decide(approved); }} />;
    return (
      <ReviewFrame screen={inboxReady ? "referrer-review-unavailable" : "referrer-loading"} eyebrow="PRIVATE REVIEW" title="Private request" backHref="/inbox">
        <div className="mt-7 max-w-xl">
          {inboxReady
            ? <p role="alert" className={alertClass}>{inboxError || "This private request is not available to your verified employee account."}</p>
            : <GoalSkeletonRows density="company" count={3} />}
        </div>
      </ReviewFrame>
    );
  }

  const overviewAlert = isSignedIn && view === "overview" ? workEmailError || inboxError : "";

  const workspace = (() => {
    if (!isSignedIn) return view === "setup" ? <GoalCapacityPanel isSignedIn={false} getToken={getToken} onSignIn={() => setSignInOpen(true)} /> : <GoalOverview onPreviewAsks={() => go("/queue")} />;
    if (access.status === "checking") return <div className="mt-6 max-w-[640px]"><GoalSkeletonRows density="company" count={3} /></div>;
    if (access.status === "error") return <div className="mt-6 max-w-[640px]"><GoalErrorState title="We could not check your verification." body={access.error.message || "Check your connection and try again."} retry={{ label: access.retrying ? "Trying again…" : "Try again", onClick: access.retry }} /></div>;
    if (access.status === "unverified") return <GoalVerifyGate />;
    return view === "setup" ? <GoalCapacityPanel isSignedIn getToken={getToken} onSignIn={() => setSignInOpen(true)} /> : <GoalOverview onPreviewAsks={() => go("/queue")} />;
  })();

  return (
    <main data-skipwait-screen={isSignedIn ? `referrer-${view}` : "referrer-sign-in"} className="page-content bg-g-canvas font-g-sans text-g-ink">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>REFERRER WORKSPACE</Kicker>
          <h1 className="mt-3 text-g-display text-g-ink">Open doors. On your terms.</h1>
          <p className="mt-2 text-g-body leading-[1.6] text-g-ink-2">Choose the requests you believe in. Keep your identity private until you accept.</p>
        </div>
        <GoalButton variant="outline" onClick={() => { if (isSignedIn) setSetupStep(0); else setSignInOpen(true); }}>Set up as a referrer<ArrowRight className="h-4 w-4" aria-hidden="true" /></GoalButton>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <GoalWorkspaceNav view={view} />
        <Link href="/referrer/impact" className="inline-flex items-center gap-1 text-g-meta text-g-ink-2 underline underline-offset-2 hover:text-g-ink">Your private impact<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </div>
      {workspace}
      {coverageRewardMessage && view === "overview" ? <p role="status" className="mt-6 max-w-[640px] rounded-[10px] border border-g-hairline p-3 text-g-small text-g-ink-2">{coverageRewardMessage}</p> : null}
      {overviewAlert ? <p role="alert" className={`mt-6 max-w-[640px] ${alertClass}`}>{overviewAlert}</p> : null}
      {signInOpen && !isSignedIn && isLoaded !== false ? <GoalSignInDialog inviteCompany={inviteCompany || undefined} inviteCode={inviteCode || undefined} onClose={() => { setSignInOpen(false); setSignInDismissed(true); }} /> : null}
      {setupStep !== null && isSignedIn ? <GoalSetupDialog initialStep={setupStep} onClose={() => setSetupStep(null)} /> : null}
    </main>
  );
}
