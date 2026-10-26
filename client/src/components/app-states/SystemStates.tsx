// Kit v4 system states for the live app shell: the "Loading" skeleton and the
// offline / slow-connection banner from app/src/routes/app-states.tsx, and the
// root error screen from app/src/routes/__root.tsx (ErrorComponent). App.tsx
// uses them for the real Suspense fallback, both error boundaries and the
// global network notices, so the gallery and the product cannot drift apart.
import type { ReactNode } from "react";

/** Kit "Loading": title bar, subtitle bar, four card blocks. Pulses only when motion is allowed. */
export function LoadingScreen() {
  return (
    <main data-skipwait-screen="route-loading" className="page-content">
      <div role="status" aria-label="Loading" className="space-y-4">
        <div className="h-8 w-40 rounded-[0.25rem] bg-muted motion-safe:animate-pulse" />
        <div className="h-4 w-56 rounded-[0.25rem] bg-muted motion-safe:animate-pulse" />
        {[0, 1, 2, 3].map(block => <div key={block} className="h-20 rounded-2xl bg-muted motion-safe:animate-pulse" />)}
      </div>
    </main>
  );
}

/** Inline loading placeholder: grey skeleton bars for sighted users, the message stays for screen readers only. */
export function LoadingNote({ children }: { children: string }) {
  return (
    <div role="status" className="mt-10 space-y-3">
      <span className="sr-only">{children}</span>
      <div aria-hidden="true" className="h-5 w-48 rounded-[0.25rem] bg-muted motion-safe:animate-pulse" />
      <div aria-hidden="true" className="h-20 rounded-2xl bg-muted motion-safe:animate-pulse" />
      <div aria-hidden="true" className="h-20 rounded-2xl bg-muted motion-safe:animate-pulse" />
    </div>
  );
}

/** Kit banner row (offline, slow connection), pinned to the top of the viewport. */
export function StatusBanner({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 flex items-center gap-2 bg-muted px-6 py-2 text-sm text-foreground">
      {icon}{children}
    </div>
  );
}

const CHUNK_LOAD_FAILURE = /dynamically imported module|importing a module script failed|loading chunk [\w-]+ failed/i;

/**
 * A lazy route whose module failed to download keeps that rejection cached, so
 * resetting the boundary would throw again at once. Only a reload recovers it.
 */
export function needsReload(error: unknown): boolean {
  return error instanceof Error && (error.name === "ChunkLoadError" || CHUNK_LOAD_FAILURE.test(error.message));
}

/** Kit root error screen: wordmark, reassurance, Try again and Go home. Never shows the raw error. */
export function ErrorScreen({ screen, onRetry }: { screen: string; onRetry: () => void }) {
  return (
    <main data-skipwait-screen={screen} className="flex min-h-dvh items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <p className="wordmark text-2xl"><img src="/brand/lockup.svg" alt="skipwait.me" className="wordmark-logo" /></p>
        <h1 className="mt-8 text-3xl font-semibold text-foreground">Something went wrong on our side.</h1>
        <p className="mt-3 text-muted-foreground">Nothing you did. Your asks and messages are safe.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">Try again</button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-6 font-semibold text-foreground">Go home</a>
        </div>
      </div>
    </main>
  );
}
