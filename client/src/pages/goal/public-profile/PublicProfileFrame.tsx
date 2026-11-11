// The goal frame for the public page /p/:handle, which sits outside the app
// shell (App.tsx is not this row's file). Brand home link, an optional
// right-hand slot (the owner's You | Visitor switch) and the page body. It
// fetches nothing itself.
import type { ReactNode } from "react";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";

export function PublicProfileFrame({ screen, right, children }: { screen: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div data-skipwait-screen={screen} data-goal-page="public-profile" className="g-scope min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 gdesk:px-5">
          <a href="/" aria-label="skipwait.me home" className="inline-flex shrink-0 items-center"><GoalBrandMark /></a>
          {right}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 gdesk:px-5 gdesk:pt-10">{children}</main>
    </div>
  );
}
