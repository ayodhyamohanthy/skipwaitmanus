// Pinned work on the ask (queue task 13, D-022 row 13): the showcase pieces a
// verified referrer sees with this ask before they decide. One picker for both
// composer surfaces — /ask and the directory drawer — because both read the
// same state from useAskComposer and send the same body from askSend.ts.
//
// What a piece carries is deliberately narrow (shared/askWorkItems.ts): title,
// kind, source and public link. No seeker id, no showcase row ids. The server
// snapshots the list at send time, so editing or deleting the piece afterwards
// never rewrites what a referrer was shown.
import { LoaderCircle, Pin } from "lucide-react";
import { Link } from "wouter";
import { GoalFilterChip, GoalNum } from "@/components/goal";
import { workKindLabel, type WorkItem } from "@/components/profile/workItems";
import { ASK_WORK_SECTION_TITLE } from "@shared/askWorkItems";

/** What the composer hands the picker; the picker owns no state of its own. */
export type PinnedWorkState = {
  readonly pieces: readonly WorkItem[];
  readonly state: "loading" | "ready" | "failed";
  readonly selected: readonly number[];
  /** The most this plan puts in front of a referrer; the server has the last word. */
  readonly limit: number;
  /** One line explaining why a pick did not take. Empty when nothing to say. */
  readonly notice: string;
  reload(): void;
  toggle(id: number): void;
};

export function PinnedWorkPicker({ work }: { work: PinnedWorkState }) {
  const { pieces, state, selected, limit, notice } = work;
  return (
    <fieldset className="grid gap-2" aria-label={ASK_WORK_SECTION_TITLE}>
      <div className="flex items-baseline justify-between gap-3">
        <legend className="text-g-label text-g-ink">{ASK_WORK_SECTION_TITLE}</legend>
        {state === "ready" && pieces.length > 0 ? (
          <span className="text-g-meta text-g-ink-3">
            {selected.length > 0 ? <><GoalNum>{selected.length}</GoalNum> of <GoalNum>{pieces.length}</GoalNum> travel with this ask</> : "Nothing picked — the referrer sees only your note"}
          </span>
        ) : null}
      </div>
      <p className="-mt-1 text-pretty text-g-meta text-g-ink-3">
        Work from your own showcase. A referrer sees it with this ask before deciding — never your name.
      </p>

      {state === "loading" ? (
        <p aria-busy="true" className="flex items-center gap-2 text-g-meta text-g-ink-2">
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />Loading your work…
        </p>
      ) : state === "failed" ? (
        <p className="flex flex-wrap items-center gap-2 text-g-meta text-g-ink-2">
          We couldn’t load your work.
          <button type="button" className="min-h-11 font-semibold text-g-ink underline underline-offset-2" onClick={work.reload}>Try again</button>
        </p>
      ) : pieces.length === 0 ? (
        <p className="text-pretty text-g-meta text-g-ink-2">
          Nothing in your showcase yet. <Link href="/work" className="font-semibold text-g-ink underline underline-offset-2">Add a piece of work</Link> and referrers see it with your next ask.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {pieces.map(piece => (
              <GoalFilterChip
                key={piece.id}
                label={`${piece.title} · ${workKindLabel(piece.kind)}`}
                pressed={selected.includes(piece.id)}
                onPressedChange={() => work.toggle(piece.id)}
              />
            ))}
          </div>
          {notice ? <p role="status" className="text-pretty text-g-meta text-g-ink-2">{notice}</p> : null}
          {selected.length > limit ? (
            // Only reachable for a wallet that was downgraded while its pieces
            // stayed pinned: the send is refused, this says why before it is.
            <p role="status" className="text-pretty text-g-meta text-g-ink-2">
              This plan puts <GoalNum>{limit}</GoalNum> {limit === 1 ? "piece" : "pieces"} of work in front of a referrer. Unpin one to send.
            </p>
          ) : null}
        </>
      )}
      <span className="sr-only"><Pin aria-hidden="true" /></span>
    </fieldset>
  );
}
