// The referrer's personal link (D-017) in the goal UI: copy it, copy a LinkedIn bio line, pause it, or make a new one
// after pausing. Asks sent through it go to this referrer alone. Shown in the queue's empty state and below waiting
// asks, so it never hides behind a full queue (docs/SUPPLY_SPRINT.md known gap). Failures are inline, never a toast.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalConfirmDialog } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { fetchPersonalLink, pausePersonalLink } from "./queueApi";

export function PersonalLinkPanel() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const link = useQuery({ queryKey: ["referrer", "personal-link", userId ?? "session"], enabled: Boolean(isSignedIn), retry: false, staleTime: 60_000, queryFn: () => fetchPersonalLink(fetchToken) });
  const [status, setStatus] = useState("");
  const [pauseError, setPauseError] = useState("");
  const [paused, setPaused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pausing, setPausing] = useState(false);

  const copy = async (text: string, done: string, then?: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(done);
      then?.();
    } catch {
      setStatus("Copy is unavailable in this browser.");
    }
  };
  const pause = async () => {
    setPausing(true);
    setPauseError("");
    try {
      await pausePersonalLink(fetchToken);
      setPaused(true);
      setStatus("Your link is paused. It no longer opens an ask.");
      setConfirming(false);
    } catch {
      setConfirming(false);
      setPauseError("That didn’t go through. Your link is unchanged.");
    } finally {
      setPausing(false);
    }
  };
  const fresh = async () => {
    setStatus("");
    setPaused(false);
    await link.refetch();
  };

  if (link.isPending) return null;
  const frame = "mx-2 rounded-g-tile border border-g-hairline px-4 py-3.5 max-gdesk:mx-1";
  if (link.isError) {
    return (
      <section role="alert" data-testid="goal-personal-link" data-state="error" className={frame}>
        <h2 className="text-g-label text-g-ink">Your personal link</h2>
        <p className="mt-1 text-g-meta text-g-ink-2">Personal links are unavailable right now. Nothing changed.</p>
        <div className="-ml-3 mt-1"><GoalButton variant="ghost" size="sm" onClick={() => { void link.refetch(); }}>Try again</GoalButton></div>
      </section>
    );
  }
  if (!link.data) return null;
  const { url, bio } = link.data;
  const active = link.data.active && !paused;
  return (
    <section aria-labelledby="personal-link-title" data-testid="goal-personal-link" data-state={active ? "active" : "paused"} className={frame}>
      <h2 id="personal-link-title" className="text-g-label text-g-ink">Your personal link</h2>
      <p className="mt-1 text-pretty text-g-meta text-g-ink-2">
        {active ? "Asks sent through it come to you alone, for roles at your company. Share it where people already ask you for referrals." : "Your link is paused. It no longer opens an ask."}
      </p>
      {active ? (
        <>
          <p className="mt-2 truncate text-g-meta text-g-ink">{url.replace(/^https?:\/\//, "")}</p>
          <p className="mt-1 text-pretty text-g-meta text-g-ink-3">Bio line: {bio}</p>
          <div className="-ml-3 mt-1 flex flex-wrap gap-x-1">
            <GoalButton variant="ghost" size="sm" onClick={() => { void copy(url, "Link copied."); }}>Copy link</GoalButton>
            <GoalButton variant="ghost" size="sm" onClick={() => { void copy(`${bio}\n${url}`, "Bio line copied. Paste it in your LinkedIn bio.", () => window.open("https://www.linkedin.com/in/me/", "_blank", "noopener,noreferrer")); }}>Copy for LinkedIn bio</GoalButton>
            <GoalButton variant="ghost" size="sm" onClick={() => setConfirming(true)}>Pause link</GoalButton>
          </div>
        </>
      ) : (
        <div className="-ml-3 mt-1"><GoalButton variant="ghost" size="sm" onClick={() => { void fresh(); }}>Create a new link</GoalButton></div>
      )}
      {pauseError ? <p role="alert" className="mt-1 text-g-meta text-g-ink">{pauseError}</p> : null}
      <p role="status" className="mt-1 text-g-meta text-g-ink-2">{status}</p>
      <GoalConfirmDialog
        open={confirming}
        onOpenChange={open => { if (!open && !pausing) setConfirming(false); }}
        title="Pause your personal link?"
        body="It stops opening an ask for good. You can make a new link later."
        actions={
          <>
            <GoalButton variant="ghost" size="sm" touch="large" onClick={() => setConfirming(false)}>Keep it</GoalButton>
            <GoalButton variant="outline" size="sm" touch="large" busy={pausing} busyLabel="Pausing…" onClick={() => { void pause(); }}>Pause link</GoalButton>
          </>
        }
      />
    </section>
  );
}
