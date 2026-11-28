// D-089.ui (packet docs/plans/D-089-request-inbox.md §4.8; placement approved by D-414 (2)): the
// referrer's own referral link in the /referrer-home aside, after "Invite a colleague". Goal-native
// (components/goal primitives, no kit import) and mounted only while REQUEST_INBOX_LINK_ENABLED is on.
// It adds no black element: the page's one commit stays its GoalNextStep, so every action here is
// outline or ghost. The screen name is chosen once and then shown with no Edit or rename (D-398).
// States: loading, error with retry, offline, paused and the D-057 step-up, which never sends a
// signed-in referrer to the work-email sign-in (the shared fetch helpers re-check the access verdict).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pause, Play } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalField, GoalStatus, GoalTextInput, useOnlineStatus } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { trackClarityEvent } from "@/lib/clarity";
import { REQUEST_INBOX_LINK_ENABLED, screenNameRefusalFor } from "@shared/requestInboxLink";
import {
  checkScreenName, chooseScreenName, fetchReferralLink, isStepUpRequired, pauseReferralLink, resumeReferralLink, screenNameRefusalOf,
  type ReferralLink,
} from "./referralLinkApi";

export const referralLinkKey = (userId: string | null) => ["referral-link", userId] as const;

const LOAD_FAILED = "We could not load your referral link.";
const OFFLINE = "You’re offline. Reconnect to see your referral link.";

const displayUrl = (url: string) => url.replace(/^https?:\/\//, "");
const failureMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const isOffline = (error: unknown) => (typeof navigator !== "undefined" && navigator.onLine === false) || error instanceof TypeError;

export function GoalReferralLinkPanel() {
  if (!REQUEST_INBOX_LINK_ENABLED) return null;
  return <ReferralLinkPanel />;
}

function Frame({ headingId, state, busy, children }: { headingId: string; state: string; busy?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={headingId} aria-busy={busy ? "true" : undefined} data-testid="goal-referral-link-panel" data-state={state} className="rounded-g-tile border border-g-hairline p-4">
      <h2 id={headingId} className="text-g-label font-semibold text-g-ink">Your referral link</h2>
      {children}
    </section>
  );
}

function ReferralLinkPanel() {
  const { userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const headingId = useId();
  const key = referralLinkKey(userId ?? null);
  const link = useQuery({ queryKey: key, queryFn: () => fetchReferralLink(fetchToken), retry: false, refetchOnWindowFocus: false });
  const [stepUp, setStepUp] = useState(false);
  const [alert, setAlert] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [confirmPause, setConfirmPause] = useState(false);
  const reload = () => queryClient.invalidateQueries({ queryKey: key });
  const failed = (error: unknown, fallback: string) => {
    if (isStepUpRequired(error)) { setStepUp(true); return; }
    setAlert(isOffline(error) ? "You’re offline. Nothing changed. Reconnect, then try again." : `${failureMessage(error, fallback).replace(/\.$/, "")}. Nothing changed.`);
  };
  const pause = useMutation({
    mutationFn: () => pauseReferralLink(fetchToken),
    onMutate: () => { setAlert(""); setCopyNotice(""); },
    onSuccess: async () => { setConfirmPause(false); queryClient.setQueryData<ReferralLink>(key, current => (current ? { ...current, isActive: false } : current)); await reload(); },
    onError: error => failed(error, "We could not pause your link."),
  });
  const resume = useMutation({
    mutationFn: () => resumeReferralLink(fetchToken),
    onMutate: () => { setAlert(""); },
    onSuccess: async () => { await reload(); },
    onError: error => failed(error, "We could not turn your link back on."),
  });

  if (stepUp || (link.isError && isStepUpRequired(link.error))) {
    return (
      <Frame headingId={headingId} state="step-up">
        <p role="status" className="mt-2 text-g-meta text-g-ink">Confirm your work email with a code to manage your referral link. Your link and screen name are unchanged.</p>
        <Link href="/queue" className="mt-2 inline-flex min-h-11 items-center text-g-meta font-medium text-g-ink underline underline-offset-2">Confirm your work email</Link>
      </Frame>
    );
  }
  if (link.isPending) {
    const waitingForNetwork = link.fetchStatus === "paused";
    return (
      <Frame headingId={headingId} state={waitingForNetwork ? "offline" : "loading"} busy={!waitingForNetwork}>
        {waitingForNetwork ? <p role="status" className="mt-2 text-g-meta text-g-ink-2">{OFFLINE}</p> : (
          <div className="mt-3 grid gap-2">
            <span className="sr-only">Loading your referral link</span>
            <div aria-hidden="true" className="h-4 w-4/5 rounded bg-g-surface-hover" />
            <div aria-hidden="true" className="h-9 rounded bg-g-surface-hover" />
          </div>
        )}
      </Frame>
    );
  }
  if (link.isError) {
    const offline = isOffline(link.error);
    const detail = offline ? OFFLINE : failureMessage(link.error, LOAD_FAILED);
    return (
      <Frame headingId={headingId} state={offline ? "offline" : "error"}>
        <div role="alert" className="mt-2">
          <p className="text-g-meta text-g-ink">{LOAD_FAILED}</p>
          {detail !== LOAD_FAILED ? <p className="mt-1 text-g-meta text-g-ink-2">{detail}</p> : null}
        </div>
        <GoalButton className="mt-2" flush size="sm" variant="ghost" busy={link.isFetching} busyLabel="Trying again…" onClick={() => { void link.refetch(); }}>Try again</GoalButton>
      </Frame>
    );
  }

  const data = link.data;
  const copy = async () => {
    setAlert("");
    try {
      await navigator.clipboard.writeText(data.vanityUrl);
      setCopyNotice("Link copied.");
      trackClarityEvent("referral_link_copied");
    } catch {
      setCopyNotice("Copy is unavailable in this browser. Select the link above and copy it.");
    }
  };

  return (
    <Frame headingId={headingId} state={data.isActive ? "on" : "paused"}>
      <p className="mt-1 text-g-meta text-g-ink-2">Share it where people look for referrals, like your LinkedIn bio. Referral requests through it come only to you.</p>
      <GoalStatus className="mt-3" status={data.isActive ? "queue_new" : "waiting"} label={data.isActive ? "Link on" : "Link paused"} />
      <p data-testid="referral-link-url" className="mt-2 text-g-label text-g-ink [overflow-wrap:anywhere]">{displayUrl(data.vanityUrl)}</p>
      {data.isActive ? (
        <>
          <GoalButton className="mt-2" variant="outline" size="sm" leadingIcon={Copy} onClick={() => { void copy(); }}>Copy link</GoalButton>
          {copyNotice ? <p role="status" className="mt-1 text-g-meta text-g-ink-2">{copyNotice}</p> : null}
        </>
      ) : (
        <>
          <p className="mt-2 text-g-meta text-g-ink-2">No new referral requests come through it while it is paused. Turning it back on keeps the same link and name.</p>
          <GoalButton className="mt-2" variant="outline" size="sm" leadingIcon={Play} busy={resume.isPending} busyLabel="Turning it on…" disabledReason={!online ? "Reconnect to turn your link back on." : undefined} onClick={() => resume.mutate()}>Turn your link back on</GoalButton>
        </>
      )}

      <ScreenName link={data} online={online} getToken={fetchToken} onStepUp={() => setStepUp(true)} reload={reload} />

      {alert ? <p role="alert" className="mt-3 text-g-meta text-g-ink">{alert}</p> : null}
      {data.isActive ? (
        <div className="mt-3 border-t border-g-hairline pt-2">
          {confirmPause ? (
            <>
              <p className="mt-1 text-g-meta text-g-ink">Pause your link? People who open it see that it is not available, and no new referral requests come through it. Referral requests you already have stay in your queue, and your screen name stays yours.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <GoalButton variant="outline" size="sm" busy={pause.isPending} busyLabel="Pausing…" disabledReason={!online ? "Reconnect to pause your link." : undefined} onClick={() => pause.mutate()}>Yes, pause it</GoalButton>
                <GoalButton variant="ghost" size="sm" onClick={() => setConfirmPause(false)}>Keep it on</GoalButton>
              </div>
            </>
          ) : (
            <GoalButton flush variant="ghost" size="sm" leadingIcon={Pause} disabledReason={!online ? "Reconnect to pause your link." : undefined} onClick={() => { setAlert(""); setConfirmPause(true); }}>Pause link</GoalButton>
          )}
        </div>
      ) : null}
    </Frame>
  );
}

/** §4.3/§4.4 under D-398: a one-time choice while the alias is generated; afterwards the name, with no Edit or rename. */
function ScreenName({ link, online, getToken, onStepUp, reload }: {
  link: ReferralLink;
  online: boolean;
  getToken: () => Promise<string | null | undefined>;
  onStepUp(): void;
  reload(): Promise<void>;
}) {
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const opened = useRef(false);
  const choose = useMutation({
    mutationFn: (screenName: string) => chooseScreenName(getToken, screenName),
    onMutate: () => { setError(""); },
    onSuccess: async () => { setPending(null); setDraft(""); await reload(); },
    onError: async reason => {
      setPending(null);
      if (isStepUpRequired(reason)) { onStepUp(); return; }
      const refusal = screenNameRefusalOf(reason);
      if (refusal) {
        setError(screenNameRefusalFor(refusal).error);
        // A name already chosen (another tab or device) is shown rather than offered again.
        if (refusal === "screen_name_locked") await reload();
        return;
      }
      setError(isOffline(reason) ? "You’re offline. Your screen name was not saved. Reconnect, then try again." : failureMessage(reason, "We could not save your screen name."));
    },
  });

  const errorLine = error ? <p id={errorId} role="alert" className="mt-2 text-g-meta text-g-ink">{error}</p> : null;

  if (link.screenName) {
    return (
      <div className="mt-4 border-t border-g-hairline pt-3">
        <p className="text-g-meta text-g-ink-3">Screen name</p>
        <p className="mt-1 text-g-label text-g-ink [overflow-wrap:anywhere]">{link.screenName}</p>
        {errorLine ?? <p className="mt-1 text-g-meta text-g-ink-2">Seekers see this name before you accept, instead of your real name. It stays the same, so links you already shared keep reaching you.</p>}
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkScreenName(draft);
    if (!checked.ok) { setPending(null); setError(checked.error); return; }
    setError("");
    setPending(checked.screenName);
  };

  return (
    <form className="mt-4 border-t border-g-hairline pt-3" onSubmit={submit} noValidate>
      <GoalField label="Screen name" htmlFor={inputId} help="Seekers see it before you accept, instead of your real name. Not your real name or email: 3 to 30 letters, numbers or dashes. You choose it once.">
        <GoalTextInput
          id={inputId}
          value={draft}
          invalid={Boolean(error)}
          describedBy={error ? errorId : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={64}
          onFocus={() => { if (!opened.current) { opened.current = true; trackClarityEvent("referral_link_name_opened"); } }}
          onChange={event => { setDraft(event.target.value); setPending(null); }}
        />
      </GoalField>
      {errorLine}
      {pending ? (
        <div className="mt-2">
          <p className="text-g-meta text-g-ink">Save “{pending}” as your screen name? It stays the same after this, so links you share keep reaching you.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <GoalButton variant="outline" size="sm" busy={choose.isPending} busyLabel="Saving…" disabledReason={!online ? "Reconnect to save your screen name." : undefined} onClick={() => choose.mutate(pending)}>Yes, save it</GoalButton>
            <GoalButton variant="ghost" size="sm" onClick={() => setPending(null)}>Back</GoalButton>
          </div>
        </div>
      ) : (
        <GoalButton type="submit" className="mt-2" variant="outline" size="sm">Save screen name</GoalButton>
      )}
    </form>
  );
}
