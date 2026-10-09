import { Check, Eye, Pin, Plus, Upload, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button, buttonVariants } from "@/components/kit/button";
import { AddWorkSheet, type NewWorkItem } from "@/components/profile/AddWorkSheet";
import { WorkCard, type WorkPatch } from "@/components/profile/WorkCard";
import type { WorkItem } from "@/components/profile/workItems";

type OwnerCard = { displayName: string; headline: string | null; handle: string | null };

const PRINCIPLES = [
  ["No algorithm", "Nothing ranks you. Work sits on your profile, pinned pieces first."],
  ["No vanity counts", "No likes, followers or public views. Just the work."],
  ["You decide who sees it", "Visible on your profile, or only you — per piece."],
] as const;

function Heading() {
  return <div className="page-heading"><div><span className="eyebrow">NO FEED. NO LIKES. JUST YOUR WORK.</span><h1>Your work, in one quiet place<span className="brand-dot">.</span></h1><p>Publish projects to your profile. Pin your best so they lead your profile.</p></div></div>;
}

export default function Work() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [owner, setOwner] = useState<OwnerCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [view, setView] = useState<"mine" | "referrer">("mine");

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await fetchToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setLoadFailed(false);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/work-items", { credentials: "include", headers });
      const payload = await readApiJson<{ items?: WorkItem[]; error?: string }>(response, "We could not load your work");
      if (!response.ok) throw new Error(payload.error || "We could not load your work");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load your work"); setLoadFailed(true); }
    finally { setLoading(false); }
    // The owner card is context only; a failed read leaves the generic card.
    try {
      const response = await fetch("/api/profile/me", { credentials: "include", headers: await authHeaders() });
      const payload = await readApiJson<{ displayName?: string | null; profile?: { headline?: string | null; handle?: string | null } | null }>(response, "We could not load your profile");
      if (response.ok) setOwner({ displayName: payload.displayName ?? "", headline: payload.profile?.headline ?? null, handle: payload.profile?.handle ?? null });
    } catch { /* keep the generic owner card */ }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  const authedJson = async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(await authHeaders()) } });
    const payload = await readApiJson<{ item?: WorkItem; error?: string }>(response, "We could not save this work");
    if (!response.ok) throw new Error(payload.error || "We could not save this work");
    return payload;
  };

  const add = async (input: NewWorkItem) => {
    if (!input.title) { setError("Give each work item a title."); return; }
    setError(""); setBusyId(-1);
    try {
      const payload = await authedJson("/api/work-items", { method: "POST", body: JSON.stringify(input) });
      const created = payload.item;
      if (created) setItems(current => [created, ...current]);
      setAdding(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not add this work"); }
    finally { setBusyId(null); }
  };

  const patch = async (id: number, body: WorkPatch) => {
    setBusyId(id); setError("");
    try {
      const payload = await authedJson(`/api/work-items/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const updated = payload.item;
      if (updated) setItems(current => current.map(item => item.id === id ? updated : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not update this work"); }
    finally { setBusyId(null); }
  };

  const remove = async (id: number) => {
    setBusyId(id); setError("");
    try {
      const response = await fetch(`/api/work-items/${id}`, { method: "DELETE", credentials: "include", headers: await authHeaders() });
      if (!response.ok) {
        const payload = await readApiJson<{ error?: string }>(response, "We could not remove this work");
        throw new Error(payload.error || "We could not remove this work");
      }
      setItems(current => current.filter(item => item.id !== id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not remove this work"); }
    finally { setBusyId(null); }
  };

  const closeSheet = useCallback(() => { setAdding(false); setError(""); }, []);

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="work-sign-in" className="page-content work-page">
        <Heading />
        <div className="mt-6"><SignInButton><button type="button" className={buttonVariants()}>Sign in</button></SignInButton></div>
      </main>
    );
  }

  const pinned = items.filter(item => item.pinned).length;
  const shown = view === "mine" ? items : items.filter(item => item.visibleOnProfile);
  const name = owner?.displayName || "Your profile";
  return (
    <main data-skipwait-screen="work" className="page-content work-page">
      <Heading />
      <div className="work-actions"><Button className="brand-button" onClick={() => { setAdding(true); setError(""); }}><Plus />Add work</Button></div>

      <section className="work-principles">{PRINCIPLES.map(([title, text]) => <div key={title}><Check /><span><strong>{title}</strong><small>{text}</small></span></div>)}</section>

      <div className="intent-switch work-view" role="tablist" aria-label="Work view">
        <Button variant="ghost" role="tab" aria-selected={view === "mine"} className={view === "mine" ? "selected" : ""} onClick={() => setView("mine")}><Eye />My view</Button>
        <Button variant="ghost" role="tab" aria-selected={view === "referrer"} className={view === "referrer" ? "selected" : ""} onClick={() => setView("referrer")}><Users />What a referrer sees</Button>
      </div>

<<<<<<< HEAD
      <p className="mb-4 text-xs font-semibold text-[var(--muted-foreground)]" aria-live="polite">Pinned {pinned.length} of 3{pinned.length >= 3 ? " — unpin one to pin another" : ""}</p>
=======
      <section className="profile-card-preview">
        <div className="avatar-ph" aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "Y"}</div>
        <div className="min-w-0"><strong>{name}</strong><small>{owner?.headline ? `${owner.headline} · ` : ""}{owner?.handle ? <>skipwait.me/p/<em>{owner.handle}</em></> : <Link href="/profile" className="text-link">Set your profile link</Link>}</small></div>
        <span className="pin-meter" aria-live="polite"><Pin />{pinned} pinned</span>
      </section>
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81

      {error && !adding ? <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-destructive"><p>{error}</p>{loadFailed ? <Button variant="outline" size="sm" onClick={() => { void load(); }}>Try again</Button> : null}</div> : null}

      {loading ? (
        <div className="workspace-empty slim" role="status"><p>Loading your work…</p></div>
      ) : loadFailed ? null : shown.length === 0 ? (
        <div className="workspace-empty">
          <span className="empty-icon"><Upload /></span>
          {items.length === 0 ? <><h2>Add one piece you&apos;re proud of.</h2><p>Link a case study, project, article, or code.</p></> : <><h2>Nothing visible here yet</h2><p>Mark pieces visible on profile to preview them here.</p></>}
        </div>
      ) : (
<<<<<<< HEAD
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(view === "mine" ? items : items.filter(item => item.visibleOnProfile)).map(item => (
            <li key={item.id}>
              <article className={`overflow-hidden rounded-3xl border ${item.pinned ? "border-2 border-[var(--foreground)] shadow-[var(--shadow-offset)]" : "border-[var(--border)]"}`}>
                <div className="work-thumb"><FileText aria-hidden="true" />{item.pinned ? <span className="pinned-pill"><Pin aria-hidden="true" />Pinned</span> : null}</div>
                <div className="p-5">
                <div className="mb-6 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1"><Globe className="size-3.5" />{item.source || "Link"}</span>
                </div>
                <span className="eyebrow">{(KIND_LABELS[item.kind] ?? item.kind).toUpperCase()}</span>
                <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
                {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-link mt-2 text-sm">Open link <ArrowRight className="size-3" /></a> : null}
                <p className="mt-3 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">{item.visibleOnProfile ? <><Eye className="size-3.5" />Visible on profile</> : <><EyeOff className="size-3.5" />Shown only in requests</>}</p>
                {view === "mine" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button type="button" disabled={busyId === item.id || (!item.pinned && pinned.length >= 3)} title={!item.pinned && pinned.length >= 3 ? "Pin limit reached — unpin one first" : undefined} aria-pressed={item.pinned} onClick={() => { void patch(item.id, { pinned: !item.pinned }); }} className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold disabled:opacity-50">{item.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{item.pinned ? "Unpin" : "Pin"}</button>
                  <label className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold">Profile visible<input type="checkbox" checked={item.visibleOnProfile} disabled={busyId === item.id} onChange={event => { void patch(item.id, { visibleOnProfile: event.target.checked }); }} className="size-4 accent-[var(--primary)]" /></label>
                  <button type="button" disabled={busyId === item.id} aria-label={`Delete ${item.title}`} onClick={() => { void remove(item.id); }} className="ml-auto grid min-h-11 min-w-11 place-items-center text-[var(--destructive)]"><Trash2 className="size-4" /></button>
                </div>
                ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
=======
        <section className="work-grid">
          {shown.map(item => <WorkCard key={item.id} item={item} manage={view === "mine"} busy={busyId === item.id} onPatch={body => { void patch(item.id, body); }} onRemove={() => { void remove(item.id); }} />)}
        </section>
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
      )}

      {adding ? <AddWorkSheet busy={busyId !== null} error={error} onClose={closeSheet} onSubmit={input => { void add(input); }} /> : null}
    </main>
  );
}
