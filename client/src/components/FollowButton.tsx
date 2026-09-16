import { useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { readApiJson } from "@/lib/apiResponse";

type FollowState = { followers: number; followingCount: number; isFollowingViewer: boolean; isMutual: boolean; joinedMonthYear: string };

export function FollowButton({ targetUserId, compact }: { targetUserId: number; compact?: boolean }) {
  const { isSignedIn, getToken } = useAuth();
  const [state, setState] = useState<FollowState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authedFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };

  useEffect(() => {
    let active = true;
    void fetch(`/api/users/${targetUserId}/follow-state`, { credentials: "include" }).then(async response => {
      const payload = await readApiJson<FollowState & { viewerSignedIn?: boolean; error?: string }>(response, "");
      // A failure must never render as a successful empty state. Previously a 500
      // carrying an {error} body fell through to `followers: 0`, showing "0
      // followers / Follow" for a member who actually has followers.
      if (!response.ok) throw new Error(payload.error || "We could not load follow info");
      if (active) setState({ followers: payload.followers ?? 0, followingCount: payload.followingCount ?? 0, isFollowingViewer: payload.isFollowingViewer ?? false, isMutual: payload.isMutual ?? false, joinedMonthYear: payload.joinedMonthYear ?? "" });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "We could not load follow info"); });
    return () => { active = false; };
  }, [targetUserId]);

  const toggle = async () => {
    if (!isSignedIn || busy || !state) return;
    setBusy(true); setError("");
    try {
      const response = await authedFetch(`/api/users/${targetUserId}/follow`, { method: state.isFollowingViewer ? "DELETE" : "POST" });
      const payload = await readApiJson<FollowState & { following: boolean; error?: string }>(response, "We could not update this follow");
      if (!response.ok) throw new Error(payload.error || "We could not update this follow");
      setState(current => current ? { ...current, followers: payload.followers ?? current.followers, isFollowingViewer: payload.following, isMutual: payload.isMutual ?? false } : current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not update this follow"); }
    finally { setBusy(false); }
  };

  return <div className="flex items-center gap-2.5" data-skipwait-follow="row">
    {state && <span className="text-xs text-slate-600"><strong className="font-bold text-slate-900">{state.followers}</strong> follower{state.followers === 1 ? "" : "s"}{state.joinedMonthYear ? <span className="hidden sm:inline"> · Joined {state.joinedMonthYear}</span> : null}{state.isMutual ? <span className="text-primary"> · Follows you</span> : null}</span>}
    {isSignedIn ? <button type="button" onClick={() => { void toggle(); }} disabled={busy || !state} aria-pressed={Boolean(state?.isFollowingViewer)} className={compact ? "inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-bold disabled:opacity-50" : "inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-bold disabled:opacity-50"} data-skipwait-follow-state={state?.isFollowingViewer ? "following" : "not-following"}>{busy ? "Saving…" : state?.isFollowingViewer ? "Following" : "Follow"}</button> : null}
    {error && <span role="alert" className="text-xs font-semibold text-danger">{error}</span>}
  </div>;
}
