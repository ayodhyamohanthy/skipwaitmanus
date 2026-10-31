// The loading shell for the goal inbox (D-048-p3-inbox). It renders before the
// page's own chunk exists, so it is plain markup with no imports: the route
// shows a skeleton instead of a blank screen while the chunk loads, and the Kit
// page's bundle stays free of the goal primitives.
export function GoalInboxChunkLoading() {
  return (
    <main data-skipwait-screen="inbox" data-skipwait-chunk-loading="true" className="g-scope pb-10">
      <p role="status" aria-live="polite" className="sr-only">Loading your conversations…</p>
      <div aria-hidden="true" className="mt-6 grid gap-2 px-3">
        {[0, 1, 2].map(index => <div key={index} className="h-[88px] rounded bg-g-surface-hover" />)}
      </div>
    </main>
  );
}
