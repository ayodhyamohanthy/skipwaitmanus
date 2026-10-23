import { useCallback, useEffect, useState } from "react";
import type { WorkItem } from "@/components/profile/workItems";

// The /ask pinned-work picker reads the seeker's own showcase. Same read as the
// Work page, one narrow hook so the composer never has to know about the API.
type TokenFn = () => Promise<string | null>;

export type AskWorkPieces = {
  readonly pieces: readonly WorkItem[];
  readonly state: "loading" | "ready" | "failed";
  readonly reload: () => void;
};

// Browser JSON is untrusted: a piece the picker can't label or toggle is dropped.
function isWorkItem(value: unknown): value is WorkItem {
  const item = value as Partial<WorkItem> | null;
  return Boolean(item) && typeof item?.id === "number" && typeof item.title === "string" && typeof item.kind === "string";
}

/** The signed-in seeker's showcase pieces, in the server's order (pinned first). */
export function useAskWorkPieces(signedIn: boolean, getToken: TokenFn): AskWorkPieces {
  const [pieces, setPieces] = useState<readonly WorkItem[]>([]);
  const [state, setState] = useState<AskWorkPieces["state"]>("loading");
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt(current => current + 1), []);
  useEffect(() => {
    if (!signedIn) { setState("ready"); return; }
    let cancelled = false;
    setState("loading");
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/work-items", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!response.ok) throw new Error(`showcase read failed: ${response.status}`);
        const payload = await response.json() as { items?: unknown };
        if (cancelled) return;
        setPieces(Array.isArray(payload.items) ? payload.items.filter(isWorkItem) : []);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => { cancelled = true; };
  }, [signedIn, getToken, attempt]);
  return { pieces, state, reload };
}

/** The pieces the seeker pins by default: their showcase pins, capped by the transport ceiling. */
export function defaultPinnedWorkIds(pieces: readonly WorkItem[], limit: number): number[] {
  return pieces.filter(piece => piece.pinned).slice(0, limit).map(piece => piece.id);
}
