import { Link } from "wouter";
import { AppShell } from "@/components/AppShell";

// Kit v4 not-found (app/src/routes/__root.tsx NotFoundComponent). The kit
// renders it inside its shell for any unmatched path, so the catch-all route
// keeps the sidebar and tab bar. Keeps the live page's support link below the
// two actions.
export default function NotFound() {
  return <AppShell><NotFoundContent /></AppShell>;
}

export function NotFoundContent() {
  return (
    <main data-skipwait-screen="not-found" className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <p className="wordmark text-2xl">SkipWait<span className="brand-dot">.</span></p>
        <h1 className="mt-8 text-4xl font-semibold text-foreground">This door doesn't lead anywhere.</h1>
        <p className="mt-3 text-muted-foreground">The page may have moved, or the link was mistyped.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link href="/explore" className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">Explore companies</Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-6 font-semibold text-foreground">Go home</Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Looking for something specific? <Link href="/support" className="font-semibold text-foreground">Contact support</Link></p>
      </div>
    </main>
  );
}
