// Goal /profile (D-048-p3-profile; packet docs/plans/D-048-account.md).
// Same reads and writes as the kit page (GET and partial PUT /api/profile/me,
// headline and handle only); page visibility is changed on the public page,
// never here. The "What a referrer sees" summary follows the saved
// visibility, and a failed load renders its error, never an empty form.
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalFilterChip, GoalNextStep, useOnlineStatus } from "@/components/goal";
import { asProfileVisibility } from "@/components/profile/VisibilityOptions";
import { usePersistFn } from "@/hooks/usePersistFn";
import { GoalHeader, GOAL_LINE, InlineError, LoadError, LoadingState, OfflineNotice, ProfileLinkDialog, TextField, discoverability, requestJson, type ProfileRole } from "./profileParts";

type Profile = { headline: string | null; company: string | null; workEmailDomain: string | null; workEmailVerifiedAt: string | null; handle: string | null; profileVisibility: string };
type ProfilePayload = { displayName?: string; profile?: Profile | null; error?: string };

const LINE = "Share the minimum a referrer needs for a useful introduction. You decide what opens, and when.";
export const GOAL_PAGE = { goalLine: GOAL_LINE } as const;

function PrivacyRow({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border-b border-g-hairline py-3 last:border-0">
      <strong className="block text-g-label text-g-ink">{title}</strong>
      <small className="block text-g-meta text-g-ink-2">{hint}</small>
    </div>
  );
}

function SeekerOrReferrerRow({ role, verifiedCompany }: { role: ProfileRole; verifiedCompany: string | null }) {
  if (role === "seeker") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-g-hairline pt-4">
        <span className="min-w-0"><strong className="block text-g-label text-g-ink">Resume</strong><small className="block text-g-meta text-g-ink-2">Shared only after you choose and a referral request is accepted.</small></span>
        <Link href="/ask" className="text-g-meta text-g-ink underline underline-offset-[3px] hover:no-underline">Attach it to a referral request</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-g-hairline pt-4">
      <span className="min-w-0"><strong className="block text-g-label text-g-ink">Company</strong><small className="block text-g-meta text-g-ink-2">{verifiedCompany ? `${verifiedCompany} · verified by work email` : "No verified company yet."}</small></span>
      {verifiedCompany ? null : <Link href="/verify" className="text-g-meta text-g-ink underline underline-offset-[3px] hover:no-underline">Verify your work email</Link>}
    </div>
  );
}

export default function GoalProfile() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [role, setRole] = useState<ProfileRole>("seeker");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [headline, setHeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  // /profile?focus=handle (Verify, referrer setup) opens the link dialog once the current handle is known.
  const [linkOpen, setLinkOpen] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("focus") === "handle");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");

  const authHeaders = async (json = false): Promise<Record<string, string>> => {
    const token = await fetchToken();
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setLoadError("");
    try {
      const { payload } = await requestJson<ProfilePayload>("/api/profile/me", { credentials: "include", headers: await authHeaders() }, "We could not load your profile");
      setDisplayName(payload.displayName ?? "");
      setProfile(payload.profile ?? null);
      setHeadline(payload.profile?.headline ?? "");
      setLoaded(true);
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : "We could not load your profile"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  const save = async () => {
    setSaving(true); setSaveError(""); setSaved(false);
    try {
      const { payload } = await requestJson<ProfilePayload>("/api/profile/me", { method: "PUT", credentials: "include", headers: await authHeaders(true), body: JSON.stringify({ headline }) }, "We could not save your profile");
      setProfile(payload.profile ?? null);
      setSaved(true);
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : "We could not save your profile"); }
    finally { setSaving(false); }
  };

  const closeLink = useCallback(() => { setLinkOpen(false); setLinkError(""); }, []);
  const saveHandle = async (handle: string) => {
    setLinkBusy(true); setLinkError("");
    try {
      const { payload } = await requestJson<ProfilePayload>("/api/profile/me", { method: "PUT", credentials: "include", headers: await authHeaders(true), body: JSON.stringify({ handle }) }, "We could not save your profile link");
      if (payload.profile) setProfile(payload.profile);
      setLinkOpen(false);
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : "We could not save your profile link"); }
    finally { setLinkBusy(false); }
  };

  const shell = (children: React.ReactNode, screen = "profile") => (
    <main data-skipwait-screen={screen} data-goal-page="profile" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <GoalHeader line={LINE} />
      {children}
    </main>
  );

  if (!isSignedIn) {
    return shell(
      <div className="mt-6 max-w-[620px]">
        <GoalNextStep reason="Sign in to choose what referrers see about you.">
          <div className="mt-4"><SignInButton><GoalButton variant="primary" touch="large">Sign in</GoalButton></SignInButton></div>
        </GoalNextStep>
      </div>,
      "profile-sign-in",
    );
  }

  const verifiedCompany = profile?.workEmailVerifiedAt ? (profile.company || profile.workEmailDomain) : null;
  const first = discoverability(role, asProfileVisibility(profile?.profileVisibility));
  const saveBlocked = !online ? "You're offline" : undefined;

  return shell(<>
    {!online ? <OfflineNotice /> : null}
    <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Profile type">
      <GoalFilterChip label="Seeker profile" pressed={role === "seeker"} onPressedChange={() => setRole("seeker")} />
      <GoalFilterChip label="Referrer profile" pressed={role === "referrer"} onPressedChange={() => setRole("referrer")} />
    </div>

    {loading ? <LoadingState label="Loading your profile…" /> : loadError ? <LoadError message={loadError} onRetry={() => { void load(); }} /> : loaded ? (
      <div className="mt-6 grid gap-6 gdesk:grid-cols-[minmax(0,1fr)_340px] gdesk:items-start">
        <GoalNextStep reason={role === "seeker" ? "Say what you do best in one line. A referrer reads it before deciding." : "Say what you do at work in one line, so seekers know who is referring them."}>
          <div className="mt-4 grid gap-4">
            <TextField id="goal-profile-name" label="Display name" value={displayName} readOnly aria-readonly="true" help="From your sign-in account." />
            <TextField id="goal-profile-headline" label="Headline" value={headline} maxLength={180}
              onChange={event => { setHeadline(event.target.value); setSaved(false); }}
              placeholder={role === "seeker" ? "Your role and strongest area" : "Your function at work"} />
            <SeekerOrReferrerRow role={role} verifiedCompany={verifiedCompany} />
          </div>
          {saveError ? <InlineError>{saveError}</InlineError> : null}
          <p role="status" className="mt-3 text-g-meta text-g-ink">{saved ? "Profile saved." : ""}</p>
          <div className="mt-2"><GoalButton variant="primary" touch="large" busy={saving} busyLabel="Saving…" disabledReason={saveBlocked} onClick={() => { void save(); }}>Save profile</GoalButton></div>
        </GoalNextStep>

        <section aria-labelledby="goal-profile-sees" className="border border-g-hairline p-4 gdesk:p-5">
          <h2 id="goal-profile-sees" className="text-g-heading text-g-ink">What a referrer sees</h2>
          <div className="mt-2">
            <PrivacyRow title={first.title} hint={first.hint} />
            <PrivacyRow title="Useful notifications only" hint="Requests, decisions, replies, and time-sensitive safety updates." />
            <PrivacyRow title="Block and report available" hint="Leave a conversation without losing access to support." />
          </div>
          <div className="mt-3 grid gap-2 text-g-meta">
            {profile?.handle ? <Link href={`/p/${profile.handle}`} className="text-g-ink underline underline-offset-[3px] hover:no-underline">View your public page and who can see it</Link> : null}
            <button type="button" className="text-left text-g-ink underline underline-offset-[3px] hover:no-underline" onClick={() => setLinkOpen(true)}>{profile?.handle ? "Change your profile link" : "Choose your profile link"}</button>
            <Link href="/safety" className="text-g-ink underline underline-offset-[3px] hover:no-underline">Review safety boundaries</Link>
          </div>
        </section>
      </div>
    ) : null}

    {loaded ? (
      <nav aria-label="More for your profile" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-g-meta text-g-ink-2">
        <Link href="/verify" className="underline underline-offset-[3px] hover:text-g-ink">Verify work email</Link>
        <Link href="/work" className="underline underline-offset-[3px] hover:text-g-ink">Your work</Link>
        <Link href="/onboarding" className="underline underline-offset-[3px] hover:text-g-ink">Setup guide</Link>
        <Link href="/settings" className="underline underline-offset-[3px] hover:text-g-ink">Settings</Link>
      </nav>
    ) : null}

    {linkOpen && loaded ? <ProfileLinkDialog current={profile?.handle ?? null} busy={linkBusy} error={linkError} offline={!online} onClose={closeLink} onSubmit={handle => { void saveHandle(handle); }} /> : null}
  </>);
}
