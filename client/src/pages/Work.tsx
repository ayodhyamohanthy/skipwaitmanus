import { ArrowRight, Eye, EyeOff, Globe, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type WorkItem = { id: number; title: string; kind: string; source: string | null; url: string | null; pinned: boolean; visibleOnProfile: boolean };
const KINDS = [["case_study", "Case study"], ["project", "Project"], ["article", "Article"], ["code", "Code"], ["other", "Other"]] as const;
const KIND_LABELS: Record<string, string> = Object.fromEntries(KINDS);

export default function Work() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("project");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/work-items", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ items?: WorkItem[]; error?: string }>(response, "We could not load your work");
      if (!response.ok) throw new Error(payload.error || "We could not load your work");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load your work"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  const authedJson = async (path: string, init?: RequestInit) => {
    const token = await fetchToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await readApiJson<{ item?: WorkItem; error?: string }>(response, "We could not save this work");
    if (!response.ok) throw new Error(payload.error || "We could not save this work");
    return payload;
  };

  const add = async () => {
    if (!title.trim()) { setError("Give each work item a title."); return; }
    setError(""); setBusyId(-1);
    try {
      const payload = await authedJson("/api/work-items", { method: "POST", body: JSON.stringify({ title: title.trim(), kind, source: source.trim() || null, url: url.trim() || null }) });
      if (payload.item) setItems(current => [payload.item as WorkItem, ...current]);
      setTitle(""); setKind("project"); setSource(""); setUrl(""); setAdding(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not add this work"); }
    finally { setBusyId(null); }
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    setBusyId(id); setError("");
    try {
      const payload = await authedJson(`/api/work-items/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (payload.item) setItems(current => current.map(item => item.id === id ? (payload.item as WorkItem) : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not update this work"); }
    finally { setBusyId(null); }
  };

  const remove = async (id: number) => {
    setBusyId(id); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch(`/api/work-items/${id}`, { method: "DELETE", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) {
        const payload = await readApiJson<{ error?: string }>(response, "We could not remove this work");
        throw new Error(payload.error || "We could not remove this work");
      }
      setItems(current => current.filter(item => item.id !== id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not remove this work"); }
    finally { setBusyId(null); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="work-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Your space</p>
        <h1 className="mt-2 text-3xl font-semibold">My work.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">A profile-only showcase. Pin your best pieces; control what each one shows.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const pinned = items.filter(item => item.pinned);
  return (
    <main data-skipwait-screen="work" className="page-content">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div><span className="eyebrow">Your space</span><h1 className="mt-2 text-4xl font-semibold">My work<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Profile-only showcase. Pin up to your best, and choose per item whether it appears on your public profile or only inside requests.</p></div>
        <button type="button" onClick={() => { setAdding(current => !current); setError(""); }} className="brand-button"><Plus />{adding ? "Close" : "Add work"}</button>
      </div>

      {pinned.length > 0 ? <p className="mb-4 text-xs font-semibold text-[var(--muted-foreground)]" aria-live="polite">{pinned.length} pinned</p> : null}

      {adding ? (
        <section aria-label="Add work" className="mb-6 rounded-3xl border border-[var(--border)] p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold sm:col-span-2">Title<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="Enterprise approvals redesign" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" /></label>
            <label className="block text-sm font-semibold">Kind
              <select value={kind} onChange={event => setKind(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base">
                {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Source<input value={source} maxLength={80} onChange={event => setSource(event.target.value)} placeholder="Behance, GitHub, your site…" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" /></label>
            <label className="block text-sm font-semibold sm:col-span-2">Link<input value={url} inputMode="url" onChange={event => setUrl(event.target.value)} placeholder="https://…" className="mt-2 h-12 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] px-4 text-base" /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Cancel</button>
            <button type="button" disabled={busyId !== null} onClick={() => { void add(); }} className="brand-button">Save work</button>
          </div>
        </section>
      ) : null}

      {error ? <p role="alert" className="mb-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
      {loading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading your work…</p> : null}

      {!loading && items.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-medium">Add one piece you&apos;re proud of.</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Link a case study, project, article, or code.</p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <li key={item.id}>
              <article className={`rounded-3xl border p-5 ${item.pinned ? "border-2 border-[var(--foreground)] shadow-[var(--shadow-offset)]" : "border-[var(--border)]"}`}>
                <div className="mb-6 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1"><Globe className="size-3.5" />{item.source || "Link"}</span>
                  {item.pinned ? <span className="flex items-center gap-1 font-semibold text-[var(--foreground)]"><Pin className="size-3.5" />Pinned</span> : null}
                </div>
                <span className="eyebrow">{(KIND_LABELS[item.kind] ?? item.kind).toUpperCase()}</span>
                <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
                {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="text-link mt-2 text-sm">Open link <ArrowRight className="size-3" /></a> : null}
                <p className="mt-3 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">{item.visibleOnProfile ? <><Eye className="size-3.5" />Visible on profile</> : <><EyeOff className="size-3.5" />Shown only in requests</>}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button type="button" disabled={busyId === item.id} aria-pressed={item.pinned} onClick={() => { void patch(item.id, { pinned: !item.pinned }); }} className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold">{item.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{item.pinned ? "Unpin" : "Pin"}</button>
                  <label className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold">Profile visible<input type="checkbox" checked={item.visibleOnProfile} disabled={busyId === item.id} onChange={event => { void patch(item.id, { visibleOnProfile: event.target.checked }); }} className="size-4 accent-[var(--primary)]" /></label>
                  <button type="button" disabled={busyId === item.id} aria-label={`Delete ${item.title}`} onClick={() => { void remove(item.id); }} className="ml-auto grid min-h-11 min-w-11 place-items-center text-[var(--destructive)]"><Trash2 className="size-4" /></button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
