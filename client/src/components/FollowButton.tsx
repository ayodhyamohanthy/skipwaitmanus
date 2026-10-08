import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { readApiJson } from "@/lib/apiResponse";

type FollowState = { followers: number; followingCount: number; isFollowingViewer: boolean; isMutual: boolean; joinedMonthYear: string };

const EMPTY_STATE: FollowState = { followers: 0, followingCount: 0, isFollowingViewer: false, isMutual: false, joinedMonthYear: "" };

export function FollowButton({ targetUserId, compact }: { targetUserId: number; compact?: boolean }) {
  const { isSignedIn, getToken } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["follow-state", targetUserId] as const;

  const followState = useQuery({
    queryKey,
    retry: false,
    queryFn: async (): Promise<FollowState> => {
      try {
        const response = await fetch(`/api/users/${targetUserId}/follow-state`, { credentials: "include" });
        const payload = await readApiJson<FollowState & { viewerSignedIn?: boolean }>(response, "");
        return {
          followers: payload.followers ?? 0,
          followingCount: payload.followingCount ?? 0,
          isFollowingViewer: payload.isFollowingViewer ?? false,
          isMutual: payload.isMutual ?? false,
          joinedMonthYear: payload.joinedMonthYear ?? "",
        };
      } catch {
        return EMPTY_STATE;
      }
    },
  });

  const state = followState.data ?? null;

  const toggle = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return fetch(`/api/users/${targetUserId}/follow`, {
        method: state?.isFollowingViewer ? "DELETE" : "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(async (response) => {
        const payload = await readApiJson<FollowState & { following: boolean; error?: string }>(response, "We could not update this follow");
        if (!response.ok) throw new Error(payload.error || "We could not update this follow");
        return payload;
      });
    },
    onSuccess: (payload) => {
      queryClient.setQueryData<FollowState>(queryKey, (current) =>
        current ? { ...current, followers: payload.followers ?? current.followers, isFollowingViewer: payload.following, isMutual: payload.isMutual ?? false } : current,
      );
    },
  });

  const busy = toggle.isPending;
  const error = toggle.error instanceof Error ? toggle.error.message : "";

  return <div className="flex items-center gap-2.5" data-skipwait-follow="row">
    {state && <span className="text-xs text-[#505050]"><strong className="font-bold text-black">{state.followers}</strong> follower{state.followers === 1 ? "" : "s"}{state.joinedMonthYear ? <span className="hidden sm:inline"> · Joined {state.joinedMonthYear}</span> : null}{state.isMutual ? <span className="text-black"> · Follows you</span> : null}</span>}
    {isSignedIn ? <button type="button" onClick={() => { void toggle.mutate(); }} disabled={busy || !state} aria-pressed={Boolean(state?.isFollowingViewer)} className={compact ? "inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-bold" : "inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-bold"} data-skipwait-follow-state={state?.isFollowingViewer ? "following" : "not-following"}>{busy ? "Saving…" : state?.isFollowingViewer ? "Following" : "Follow"}</button> : null}
    {error && <span role="alert" className="text-xs font-semibold text-[#B91C1C]">{error}</span>}
  </div>;
}
