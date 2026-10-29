// Goal /work (D-048-p3-profile; packet docs/plans/D-048-account.md).
// Same calls as the kit page: GET/POST /api/work-items, PATCH and DELETE
// /api/work-items/:id, the partial PUT /api/profile/me for the handle.
// Per-piece visibility is privacy: "What a referrer sees" lists only pieces
// marked visible on profile, and a failed load renders its error, never the
// empty state.
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalFilterChip, GoalNextStep, GoalNum, useOnlineStatus } from "@/components/goal";
import type { WorkItem } from "@/components/profile/workItems";
import { usePersistFn } from "@/hooks/usePersistFn";
import { GoalHeader, InlineError, LoadError, LoadingState, OfflineNotice, ProfileLinkDialog, WorkDialog, WorkRow, requestJson, type NewWorkItem, type WorkPatch } from "./profileParts";

type OwnerCard = { displayName: string; headline: string | null; handle: string | null };
type ItemPayload = { item?: WorkItem; error?: string };

const LINE = "Put your best work on your profile, pinned pieces first. No feed, no likes, no ranking: you decide who sees each piece.";

export default function GoalWork() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [owner, setOwner] = useState<OwnerCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [view, setView] = useState<"mine" | "referrer">("mine");

  const authHeaders = async (json = false): Promise<Record<string, string>> => {
    const token = await fetchToken();
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setLoadError(""); setError("");
    try {
      const { payload } = await requestJson<{ items?: WorkItem[]; error?: string }>("/api/work-items", { credentials: "include", headers: await authHeaders() }, "We could not load your work");
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setLoaded(true);
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : "We could not load your work"); }
    finally { setLoading(false); }
    // The owner card is context only; a failed read leaves the generic card (kit behaviour).
    try {
      const { payload } = await requestJson<{ displayName?: string | null; profile?: { headline?: string | null; handle?: string | null } | null; error?: string }>("/api/profile/me", { credentials: "include", headers: await authHeaders() }, "We could not load your profile");
      setOwner({ displayName: payload.displayName ?? "", headline: payload.profile?.headline ?? null, handle: payload.profile?.handle ?? null });
    } catch { /* keep the generic owner card */ }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  const send = async (path: string, init: RequestInit, fallback: string) =>
    (await requestJson<ItemPayload>(path, { ...init, credentials: "include", headers: await authHeaders(true) }, fallback)).payload;

  const save = async (input: NewWorkItem) => {
    if (!input.title) { setError("Give each work item a title."); return; }
    const target = editing;
    setError(""); setBusyId(target ? target.id : -1);
    try {
      if (target) {
        const updated = (await send(`/api/work-items/${target.id}`, { method: "PATCH", body: JSON.stringify(input) }, "We could not update this work")).item;
        if (updated) setItems(current => current.map(item => item.id === target.id ? updated : item));
        setEditing(null);
      } else {
        const created = (await send("/api/work-items", { method: "POST", body: JSON.stringify(input) }, "We could not add this work")).item;
        if (created) setItems(current => [created, ...current]);
        setAdding(false);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : target ? "We could not update this work" : "We could not add this work"); }
    finally { setBusyId(null); }
  };

  const patch = async (id: number, body: WorkPatch) => {
    setBusyId(id); setError("");
    try {
      const updated = (await send(`/api/work-items/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "We could not update this work")).item;
      if (updated) setItems(current => current.map(item => item.id === id ? updated : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not update this work"); }
    finally { setBusyId(null); }
  };

  const remove = async (id: number) => {
    setBusyId(id); setError("");
    try {
      await requestJson<{ error?: string }>(`/api/work-items/${id}`, { method: "DELETE", credentials: "include", headers: await authHeaders() }, "We could not remove this work");
      setItems(current => current.filter(item => item.id !== id));
      setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not remove this work"); }
    finally { setBusyId(null); }
  };

  const closeSheet = useCallback(() => { setAdding(false); setEditing(null); setError(""); }, []);
  const closeLink = useCallback(() => { setLinkOpen(false); setLinkError(""); }, []);
  const saveHandle = async (handle: string) => {
    setLinkBusy(true); setLinkError("");
    try {
      const { payload } = await requestJson<{ profile?: { handle?: string | null } | null; error?: string }>("/api/profile/me", { method: "PUT", credentials: "include", headers: await authHeaders(true), body: JSON.stringify({ handle }) }, "We could not save your profile link");
      const savedHandle = payload.profile?.handle ?? handle;
      setOwner(current => ({ displayName: current?.displayName ?? "", headline: current?.headline ?? null, handle: savedHandle }));
      setLinkOpen(false);
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : "We could not save your profile link"); }
    finally { setLinkBusy(false); }
  };

  const shell = (children: React.ReactNode, screen = "work") => (
    <main data-skipwait-screen={screen} data-goal-page="work" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <GoalHeader line={LINE} />
      {children}
    </main>
  );

  if (!isSignedIn) {
    return shell(
      <div className="mt-6 max-w-[620px]">
        <GoalNextStep reason="Sign in to put your work on your profile and choose who sees each piece.">
          <div className="mt-4"><SignInButton><GoalButton variant="primary" touch="large">Sign in</GoalButton></SignInButton></div>
        </GoalNextStep>
      </div>,
      "work-sign-in",
    );
  }

  const pinned = items.filter(item => item.pinned).length;
  const visibleCount = items.filter(item => item.visibleOnProfile).length;
  const shown = view === "mine" ? items : items.filter(item => item.visibleOnProfile);
  const name = owner?.displayName || "Your profile";
  const sheetOpen = adding || editing !== null;

  return shell(<>
    {!online ? <OfflineNotice /> : null}
    <div className="mt-6 grid gap-6 gdesk:grid-cols-[minmax(0,1fr)_340px] gdesk:items-start">
      <div className="min-w-0">
        <GoalNextStep reason={loaded && items.length === 0 ? "Add one piece you're proud of: a case study, project, article or code." : "Add a piece, then pin your best so it leads your profile."}>
          <div className="mt-4"><GoalButton variant="primary" touch="large" disabledReason={!online ? "You're offline" : undefined} onClick={() => { setAdding(true); setError(""); }}>Add work</GoalButton></div>
        </GoalNextStep>

        <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Work view">
          <GoalFilterChip label="My view" pressed={view === "mine"} onPressedChange={() => setView("mine")} />
          <GoalFilterChip label="What a referrer sees" pressed={view === "referrer"} onPressedChange={() => setView("referrer")} />
        </div>

        {error && !sheetOpen ? <InlineError>{error}</InlineError> : null}

        {loading ? <LoadingState label="Loading your work…" /> : loadError ? <LoadError message={loadError} onRetry={() => { void load(); }} /> : loaded ? (
          shown.length === 0 ? (
            <div className="mt-6 border border-g-hairline p-4">
              {items.length === 0
                ? <><p className="text-g-label text-g-ink">Add one piece you're proud of.</p><p className="mt-1 text-g-meta text-g-ink-2">Link a case study, project, article, or code.</p></>
                : <><p className="text-g-label text-g-ink">Nothing visible to referrers yet.</p><p className="mt-1 text-g-meta text-g-ink-2">Mark a piece visible on profile to show it here.</p></>}
            </div>
          ) : (
            <section aria-label={view === "mine" ? "Your work" : "Work a referrer sees"} className="mt-4">
              {view === "referrer" ? <p className="text-g-meta text-g-ink-2">Only pieces marked visible on profile. Pieces marked only me stay with you.</p> : null}
              <ul className="mt-2">
                {shown.map(item => <WorkRow key={item.id} item={item} manage={view === "mine"} busy={busyId === item.id} offline={!online}
                  onPatch={body => { void patch(item.id, body); }} onEdit={() => { setEditing(item); setError(""); }} />)}
              </ul>
            </section>
          )
        ) : null}
      </div>

      <section aria-labelledby="goal-work-owner" className="border border-g-hairline p-4 gdesk:p-5">
        <h2 id="goal-work-owner" className="text-g-heading text-g-ink">Your profile</h2>
        <p className="mt-2 text-g-label text-g-ink">{name}</p>
        {owner?.headline ? <p className="text-g-meta text-g-ink-2">{owner.headline}</p> : null}
        <p className="mt-2 text-g-meta text-g-ink-2">
          {owner?.handle
            ? <button type="button" className="text-left text-g-ink underline underline-offset-[3px] hover:no-underline" title="Change your profile link" onClick={() => setLinkOpen(true)}>skipwait.me/p/<span>{owner.handle}</span></button>
            : <button type="button" className="text-left text-g-ink underline underline-offset-[3px] hover:no-underline" onClick={() => setLinkOpen(true)}>Set your profile link</button>}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 text-g-meta text-g-ink-2" aria-live="polite">
          <span data-testid="pin-count"><GoalNum>{pinned}</GoalNum> pinned</span>
          {loaded ? <span><GoalNum>{visibleCount}</GoalNum> visible on profile</span> : null}
        </p>
      </section>
    </div>

    {sheetOpen ? <WorkDialog key={editing ? editing.id : "new"} busy={busyId !== null} error={error} offline={!online} editing={editing ?? undefined}
      onClose={closeSheet} onSubmit={input => { void save(input); }} onRemove={editing ? () => { void remove(editing.id); } : undefined} /> : null}
    {linkOpen ? <ProfileLinkDialog current={owner?.handle ?? null} busy={linkBusy} error={linkError} offline={!online} onClose={closeLink} onSubmit={handle => { void saveHandle(handle); }} /> : null}
  </>);
}
