// Goal error fallback for both error boundaries (D-048-F-app-wrapper). Same
// words, actions and screen ids as the legacy ErrorScreen; the raw error is
// never shown. One h1, one black commit (Try again), Go home as a ghost link.
import { GoalBrandMark } from "../GoalBrandMark";
import { GoalButton } from "../GoalButton";

export function GoalErrorFallback({ screen, onRetry }: { screen: string; onRetry: () => void }) {
  return (
    <main data-skipwait-screen={screen} data-goal-wrapper="error" className="g-scope flex min-h-dvh flex-col bg-g-canvas text-g-ink">
      <div className="px-6 pt-6 max-gdesk:px-4 max-gdesk:pt-4">
        <GoalBrandMark />
      </div>
      <div className="flex flex-1 items-center px-6 pb-16 max-gdesk:px-4">
        <div className="mx-auto w-full max-w-[480px]">
          <h1 className="text-g-display text-balance text-g-ink">Something went wrong on our side.</h1>
          <p className="mt-2 text-g-body text-pretty text-g-ink-2">Nothing you did. Your asks and messages are safe.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <GoalButton variant="primary" onClick={onRetry}>Try again</GoalButton>
            <GoalButton variant="ghost" asChild><a href="/">Go home</a></GoalButton>
          </div>
        </div>
      </div>
    </main>
  );
}
