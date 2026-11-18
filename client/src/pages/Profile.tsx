import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { Button, buttonVariants } from "@/components/kit/button";
import { PrivacyControls, type ProfileRole } from "@/components/profile/PrivacyControls";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileLinkSheet } from "@/components/profile/ProfileLinkSheet";
import { asProfileVisibility } from "@/components/profile/VisibilityOptions";

// The kit form edits the headline only; the other profile columns are left
// untouched because PUT /api/profile/me is a partial update.
type Profile = { headline: string | null; company: string | null; workEmailDomain: string | null; workEmailVerifiedAt: string | null; handle: string | null; profileVisibility: string };

function Heading({ children }: { children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow">YOU CONTROL WHAT OPENS</span><h1>Profile &amp; privacy<span className="brand-dot">.</span></h1><p>Share the minimum needed for a useful introduction.</p></div>
      {children}
    </div>
  );
}

// Goal-UI migration (D-048-p3-profile): the goal page replaces this one when
// the "profile" surface flag is on; off, the kit page below is unchanged.
const GoalProfile = lazy(() => import("./goal/profile/GoalProfile"));

export default function Profile() {
  if (goalSurfaceOn("profile")) return <Suspense fallback={null}><GoalProfile /></Suspense>;
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [role, setRole] = useState<ProfileRole>("seeker");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [headline, setHeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  // /profile?focus=handle (Verify, referrer setup) asks for the profile handle.
  // The kit /profile has no handle field, so the handle sheet opens with its
  // input focused once the current handle is known.
  const [linkSheet, setLinkSheet] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("focus") === "handle");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setLoadFailed(false);
    try {
      const token = await fetchToken();
      const response = await fetch("/api/profile/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ displayName?: string; profile?: Profile | null; error?: string }>(response, "We could not load your profile");
      if (!response.ok) throw new Error(payload.error || "We could not load your profile");
      setDisplayName(payload.displayName ?? "");
      const current = payload.profile;
      setProfile(current ?? null);
      setHeadline(current?.headline ?? "");
      setLoaded(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load your profile"); setLoadFailed(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const token = await fetchToken();
      const response = await fetch("/api/profile/me", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ headline }) });
      const payload = await readApiJson<{ profile?: Profile | null; error?: string }>(response, "We could not save your profile");
      if (!response.ok) throw new Error(payload.error || "We could not save your profile");
      setProfile(payload.profile ?? null);
      setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not save your profile"); }
    finally { setSaving(false); }
  };

  const closeLinkSheet = useCallback(() => { setLinkSheet(false); setLinkError(""); }, []);
  const saveHandle = async (handle: string) => {
    setLinkBusy(true); setLinkError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/profile/me", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ handle }) });
      const payload = await readApiJson<{ profile?: Profile | null; error?: string }>(response, "We could not save your profile link");
      if (!response.ok) throw new Error(payload.error || "We could not save your profile link");
      if (payload.profile) setProfile(payload.profile);
      setLinkSheet(false);
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : "We could not save your profile link"); }
    finally { setLinkBusy(false); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="profile-sign-in" className="page-content profile-page">
        <Heading />
        <div className="mt-6"><SignInButton><button type="button" className={buttonVariants()}>Sign in <ArrowRight /></button></SignInButton></div>
      </main>
    );
  }

  const verifiedCompany = profile?.workEmailVerifiedAt ? (profile.company || profile.workEmailDomain) : null;
  return (
    <main data-skipwait-screen="profile" className="page-content profile-page">
      <Heading>
        <div className="flex flex-wrap gap-2">
          {profile?.handle ? <Button variant="outline" asChild><Link href={`/p/${profile.handle}`}>View public profile <ArrowRight /></Link></Button> : null}
          <Button variant="outline" asChild><Link href="/verify">Verify work email</Link></Button>
          <Button variant="outline" asChild><Link href="/onboarding">Setup guide</Link></Button>
          <Button variant="outline" asChild><Link href="/settings">Settings</Link></Button>
        </div>
      </Heading>
      <div className="intent-switch profile-switch" role="tablist" aria-label="Profile type">
        <Button variant="ghost" role="tab" aria-selected={role === "seeker"} className={role === "seeker" ? "selected" : ""} onClick={() => setRole("seeker")}><UserRound />Seeker profile</Button>
        <Button variant="ghost" role="tab" aria-selected={role === "referrer"} className={role === "referrer" ? "selected" : ""} onClick={() => setRole("referrer")}><ShieldCheck />Referrer profile</Button>
      </div>

      {loading ? (
        <LoadingNote>Loading your profile…</LoadingNote>
      ) : loadFailed ? (
        <div className="workspace-empty slim" role="alert">
          <p className="font-semibold text-destructive">{error}</p>
          <Button variant="outline" onClick={() => { void load(); }}>Try again</Button>
        </div>
      ) : (
        <section className="profile-layout items-start">
          <ProfileForm
            role={role}
            displayName={displayName}
            headline={headline}
            onHeadline={value => { setHeadline(value); setSaved(false); }}
            verifiedCompany={verifiedCompany}
            saving={saving}
            saved={saved}
            error={error}
            onSave={() => { void save(); }}
          />
          <PrivacyControls role={role} visibility={asProfileVisibility(profile?.profileVisibility)} />
        </section>
      )}
      {linkSheet && loaded ? <ProfileLinkSheet current={profile?.handle ?? null} busy={linkBusy} error={linkError} onClose={closeLinkSheet} onSubmit={handle => { void saveHandle(handle); }} /> : null}
    </main>
  );
}
