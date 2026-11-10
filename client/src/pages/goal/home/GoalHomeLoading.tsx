// Signed-in home while auth loads (D-048-p3-home-signed-in, packet
// docs/plans/D-048-marketing.md §3): the fetch-free goal frame, so a signed-in
// person never sees the marketing landing flash before their own home. It
// fetches nothing by construction: no useAuth, no useQuery, no router read.
import { GoalSkeletonRows } from "@/components/goal";

export function GoalHomeLoading() {
  return (
    <div data-testid="goal-home-loading" className="min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <main className="g-scope mx-auto w-full max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Get referred.</h1>
        <p role="status" className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-g-ink-3" />
          Checking your sign-in…
        </p>
        <GoalSkeletonRows density="company" count={3} className="mt-6" />
      </main>
    </div>
  );
}

export default GoalHomeLoading;
