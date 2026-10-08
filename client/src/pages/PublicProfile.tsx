import { ArrowRight, BadgeCheck, Copy, Eye, EyeOff, Globe, Link2, LockKeyhole, MapPin, Pin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/_core/auth";
import { readApiJson } from "@/lib/apiResponse";

type WorkItem = { id: number; title: string; kind: string; source: string | null; url: string | null; pinned: boolean; visibleOnProfile: boolean };
type PublicProfile = {
  visible: boolean;
  visibility: string;
  isOwner?: boolean;
  displayName?: string;
  headline?: string | null;
  currentTitle?: string | null;
  location?: string | null;
  bio?: string | null;
  skills?: string | null;
  verifiedWork?: { domain: string | null; verifiedAt: string } | null;
  handle?: string | null;
  workItems?: WorkItem[];
};

const KIND_LABELS: Record<string, string> = { case_study: "Case study", project: "Project", article: "Article", code: "Code", other: "Work" };

export default function PublicProfile() {
  const [, params] = useRoute("/p/:handle");
  const handle = params?.handle ?? "";
  const { getToken } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");

  const refresh = async () => {
    if (!handle) return;
    setLoading(true); setMissing(false);
    try {
      const response = await fetch(`/api/p/${encodeURIComponent(handle)}`, { credentials: "include" });
      if (response.status === 404) { setMissing(true); return; }
      const payload = await readApiJson<{ profile?: PublicProfile; error?: string }>(response, "We could not load this profile");
      if (!response.ok || !payload.profile) throw new Error(payload.error || "We could not load this profile");
      setProfile(payload.profile);
    } catch { setMissing(true); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!handle) return;
    let active = true;
    setLoading(true); setMissing(false);
    void (async () => {
      try {
        const response = await fetch(`/api/p/${encodeURIComponent(handle)}`, { credentials: "include" });
        if (response.status === 404) { if (active) setMissing(true); return; }
        const payload = await readApiJson<{ profile?: PublicProfile; error?: string }>(response, "We could not load this profile");
        if (!response.ok || !payload.profile) throw new Error(payload.error || "We could not load this profile");
        if (active) setProfile(payload.profile);
      } catch { if (active) setMissing(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [handle]);

  const saveVisibility = async (visibility: "public" | "link" | "private") => {
    if (!profile?.isOwner || savingVisibility) return;
    setSavingVisibility(true); setVisibilityError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/profile/me", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ profileVisibility: visibility }) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not update visibility");
      if (!response.ok) throw new Error(payload.error || "We could not update visibility");
      await refresh();
    } catch (error) { setVisibilityError(error instanceof Error ? error.message : "We could not update visibility"); }
    finally { setSavingVisibility(false); }
  };

  useEffect(() => {
    if (profile?.visible && profile.visibility === "link") {
      const meta = document.createElement("meta");
      meta.name = "robots";
      meta.content = "noindex";
      document.head.appendChild(meta);
      return () => { document.head.removeChild(meta); };
    }
    return undefined;
  }, [profile]);

  const initials = (profile?.displayName ?? "?").trim().split(/\s+/).map(part => part.charAt(0)).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <div data-skipwait-screen="public-profile" className="min-h-screen bg-[var(--background)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="text-xl font-semibold tracking-[-.04em]" aria-label="skipwait.me home">SkipWait<span className="brand-dot">.</span></Link>
        {profile?.visible && profile.isOwner ? <span className="eyebrow">Your public page · {profile.visibility === "link" ? "link only" : profile.visibility}</span> : null}
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16">
        {loading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading this profile…</p> : null}
        {!loading && (missing || (profile && !profile.visible)) ? (
          <section className="rounded-3xl bg-[var(--muted)] p-10 text-center">
            <LockKeyhole className="mx-auto mb-3 size-8" />
            <h1 className="text-2xl font-semibold">This profile is private.</h1>
            <p className="mt-2 text-[var(--muted-foreground)]">It&apos;s shared only with referrers this person asks.</p>
            <Link href="/explore" className="brand-button mt-6">Explore companies <ArrowRight /></Link>
          </section>
        ) : null}
        {profile?.visible ? (
          <>
            {profile.isOwner ? (
              <section className="mb-6 rounded-3xl border border-[var(--border)] p-5" aria-label="Manage profile visibility">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0"><span className="eyebrow">Who can see this</span><p className="mt-1 flex items-center gap-2 text-sm"><Link2 className="size-4 shrink-0" /><span className="truncate">skipwait.me/p/{profile.handle}</span></p></div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { void navigator.clipboard?.writeText(`https://skipwait.me/p/${profile.handle}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]"><Copy />{copied ? "Copied" : "Copy link"}</button>
                    <Link href="/profile" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Manage</Link>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Profile visibility">
                  {(["public", "link", "private"] as const).map(value => (
                    <button key={value} type="button" role="radio" aria-checked={profile.visibility === value} disabled={savingVisibility} onClick={() => { void saveVisibility(value); }} className={`min-h-11 rounded-xl border px-2 text-sm ${profile.visibility === value ? "border-[var(--primary)] bg-[var(--primary)]/5 font-semibold" : "border-[var(--border)]"}`}>{value === "link" ? "Link only" : value === "public" ? "Public" : "Private"}</button>
                  ))}
                </div>
                {visibilityError ? <p role="alert" className="mt-3 text-sm font-semibold text-[var(--destructive)]">{visibilityError}</p> : null}
              </section>
            ) : null}
            <section className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <span className="grid size-24 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-3xl font-semibold" aria-hidden="true">{initials}</span>
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-semibold sm:text-4xl">{profile.displayName}</h1>
                {(profile.currentTitle || profile.headline) ? <p className="mt-1 text-lg">{[profile.currentTitle, profile.headline].filter(Boolean).join(" · ")}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
                  {profile.location ? <span className="flex items-center gap-1"><MapPin className="size-4" />{profile.location}</span> : null}
                  {profile.verifiedWork ? <span className="flex items-center gap-1 text-[var(--foreground)]"><BadgeCheck className="size-4 text-[var(--primary)]" />Verified at {profile.verifiedWork.domain} via work email</span> : null}
                </p>
              </div>
            </section>
            {profile.bio ? <p className="mt-5 max-w-2xl leading-7">{profile.bio}</p> : null}
            {profile.skills ? <p className="mt-3 text-sm text-[var(--muted-foreground)]">{profile.skills}</p> : null}

            <section className="mt-10" aria-label="Work">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 className="text-xl font-semibold">Work</h2>
                {profile.isOwner ? <Link href="/work" className="text-link text-sm">Manage work →</Link> : null}
              </div>
              {!profile.workItems?.length ? (
                <div className="rounded-3xl border border-dashed border-[var(--border)] p-10 text-center">
                  <p className="font-medium">{profile.isOwner ? "Add one piece you're proud of." : "No public work yet."}</p>
                  {profile.isOwner ? <Link href="/work" className="brand-button mt-4">Add work</Link> : null}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {profile.workItems.map(item => (
                    <article key={item.id} className="rounded-3xl border border-[var(--border)] p-5">
                      <div className="mb-10 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                        <span className="flex items-center gap-1"><Globe className="size-3.5" />{item.source || "Link"}</span>
                        {item.pinned ? <span className="flex items-center gap-1 text-[var(--foreground)]"><Pin className="size-3.5" />Pinned</span> : null}
                      </div>
                      <span className="eyebrow">{(KIND_LABELS[item.kind] ?? item.kind).toUpperCase()}</span>
                      <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
                      {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-link mt-2 text-sm">Open link <ArrowRight className="size-3" /></a> : null}
                      {profile.isOwner ? <p className="mt-3 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">{item.visibleOnProfile ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{item.visibleOnProfile ? "Visible on profile" : "Shown only in requests"}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <p className="mt-12 text-center text-sm text-[var(--muted-foreground)]">No feed. No followers. No likes. Just work. · <Link href="/" className="text-link">Make your own on SkipWait</Link></p>
          </>
        ) : null}
      </main>
    </div>
  );
}
