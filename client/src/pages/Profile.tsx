import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button, buttonVariants } from "@/components/kit/button";
import { PrivacyControls, type ProfileRole } from "@/components/profile/PrivacyControls";
import { ProfileForm, type ProfileFormState } from "@/components/profile/ProfileForm";
import { asProfileVisibility } from "@/components/profile/VisibilityOptions";

type Profile = { headline: string | null; currentTitle: string | null; location: string | null; bio: string | null; skills: string | null; openTo: string | null; company: string | null; workEmailDomain: string | null; workEmailVerifiedAt: string | null; handle: string | null; profileVisibility: string };

const EMPTY_FORM: ProfileFormState = { headline: "", currentTitle: "", location: "", bio: "", skills: "", openToText: "", handle: "", profileVisibility: "private" };

function openToTextFromStored(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((role): role is string => typeof role === "string").join(", ");
  } catch { /* fall through to plain text */ }
  return raw;
}

function Heading({ children }: { children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow">YOU CONTROL WHAT OPENS</span><h1>Profile &amp; privacy<span className="brand-dot">.</span></h1><p>Share the minimum needed for a useful introduction.</p></div>
      {children}
    </div>
  );
}

export default function Profile() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [role, setRole] = useState<ProfileRole>("seeker");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [referrerNamed, setReferrerNamed] = useState(false);

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
      setForm({
        headline: current?.headline ?? "",
        currentTitle: current?.currentTitle ?? "",
        location: current?.location ?? "",
        bio: current?.bio ?? "",
        skills: current?.skills ?? "",
        openToText: openToTextFromStored(current?.openTo ?? null),
        handle: current?.handle ?? "",
        profileVisibility: asProfileVisibility(current?.profileVisibility),
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load your profile"); setLoadFailed(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  // Referrer naming decides the referrer privacy line; anonymous is the
  // server default, so a failed read keeps the anonymous wording.
  useEffect(() => {
    if (!isSignedIn || role !== "referrer") return;
    let active = true;
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/referrer-preferences", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ preferences?: { referrerVisibility?: string } }>(response, "We could not load your referrer settings");
        if (active && response.ok) setReferrerNamed(payload.preferences?.referrerVisibility === "named");
      } catch { /* keep the default anonymous wording */ }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn, role]);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const token = await fetchToken();
      const response = await fetch("/api/profile/me", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ ...form, openTo: form.openToText.split(",").map(role => role.trim()).filter(role => role.length > 0), handle: form.handle.trim() === "" ? null : form.handle }) });
      const payload = await readApiJson<{ profile?: Profile | null; error?: string }>(response, "We could not save your profile");
      if (!response.ok) throw new Error(payload.error || "We could not save your profile");
      setProfile(payload.profile ?? null);
      setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not save your profile"); }
    finally { setSaving(false); }
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
  const copyLink = () => { void navigator.clipboard?.writeText(`https://skipwait.me/p/${form.handle.trim().toLowerCase()}`); setCopied(true); setTimeout(() => setCopied(false), 1500); };
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
        <div className="workspace-empty slim" role="status"><p>Loading your profile…</p></div>
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
            form={form}
            onField={(field, value) => { setForm(current => ({ ...current, [field]: value })); setSaved(false); }}
            onVisibility={value => { setForm(current => ({ ...current, profileVisibility: value })); setSaved(false); }}
            verifiedCompany={verifiedCompany}
            saving={saving}
            saved={saved}
            error={error}
            copied={copied}
            onCopy={copyLink}
            onSave={() => { void save(); }}
          />
          <PrivacyControls role={role} visibility={asProfileVisibility(profile?.profileVisibility)} referrerNamed={referrerNamed} verifiedDomain={verifiedCompany} />
        </section>
      )}
    </main>
  );
}
