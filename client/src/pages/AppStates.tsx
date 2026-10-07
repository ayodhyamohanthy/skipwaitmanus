import { useState } from "react";
import { AlertTriangle, ArrowRight, Bell, CreditCard, Download, RefreshCw, SearchX, Share, Signal, WifiOff, X } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/app-states` (screens/web/33_app-states__*.png,
 * app/src/routes/app-states.tsx).
 *
 * Nine system states in a phone frame, so every edge the PWA can hit has a
 * designed answer. The state switcher stays: this screen IS a gallery, so
 * choosing a state is the page's function rather than preview scaffolding.
 *
 * ONE THING CHANGED FOR PRODUCTION: the kit prints "Error ref: SW-5F2A", a
 * hard-coded identifier. A fabricated error reference is the same class of
 * error as a fabricated count — an operator would quote it and find nothing.
 * The line now renders the reference it is given, and in the gallery (where no
 * error has happened) it says so instead of inventing one.
 *
 * Buttons that would mutate — "Install app", "Turn on notifications", "Pay
 * with UPI" — are intentionally inert here: this is a state gallery, not the
 * live surface. The states are reached for real from /offline, the service
 * worker and the payment flow.
 */

const STATES = [
  "Install (Android)",
  "Install (iPhone)",
  "Push permission",
  "Offline",
  "Slow connection",
  "Not found",
  "Something went wrong",
  "Payment failed",
  "Loading",
] as const;

type State = (typeof STATES)[number];

function Center({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="m-auto text-center">
      <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-muted">{icon}</span>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{text}</p>
      {children && <div className="mt-6 grid gap-2">{children}</div>}
    </div>
  );
}

const primary = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground";
const quiet = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-muted-foreground";

const Backdrop = () => (
  <div className="space-y-3 opacity-40" aria-hidden="true">
    <div className="h-6 w-32 rounded bg-muted" />
    <div className="h-24 rounded-2xl bg-muted" />
    <div className="h-24 rounded-2xl bg-muted" />
  </div>
);

function StateBody({ state, go }: { state: State; go: (next: State) => void }) {
  switch (state) {
    case "Install (Android)":
      return (
        <>
          <Backdrop />
          <div className="absolute inset-x-3 bottom-3 rounded-3xl border border-border bg-card p-5 shadow-lg">
            <button type="button" className="absolute right-2 top-2 grid size-11 place-items-center" aria-label="Dismiss"><X className="size-5" aria-hidden="true" /></button>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground" aria-hidden="true">S.</span>
              <span>
                <strong className="block">Install SkipWait</strong>
                <small className="text-muted-foreground">Know the moment a referrer replies</small>
              </span>
            </div>
            <button type="button" className={`${primary} mt-4`}><Download className="size-4" aria-hidden="true" />Install app</button>
            <button type="button" className="mt-2 min-h-11 w-full text-sm text-muted-foreground">Not now</button>
          </div>
        </>
      );
    case "Install (iPhone)":
      return (
        <>
          <Backdrop />
          <div className="absolute inset-x-3 bottom-3 rounded-3xl border border-border bg-card p-5 shadow-lg">
            <strong className="block">Add SkipWait to your Home Screen</strong>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs" aria-hidden="true">1</span>Tap <Share className="size-4" aria-hidden="true" /> Share in Safari</li>
              <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs" aria-hidden="true">2</span>Choose "Add to Home Screen"</li>
              <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs" aria-hidden="true">3</span>Open it from your Home Screen</li>
            </ol>
            <button type="button" className="mt-4 min-h-11 w-full text-sm text-muted-foreground">Got it</button>
          </div>
        </>
      );
    case "Push permission":
      return (
        <Center icon={<Bell className="size-8 text-primary" aria-hidden="true" />} title="Know the moment a door opens." text="We'll only notify you when a referrer accepts, replies, or an ask is about to expire. Never marketing.">
          <button type="button" className={primary}>Turn on notifications</button>
          <button type="button" className={quiet}>Maybe later</button>
        </Center>
      );
    case "Offline":
      return (
        <>
          <div className="-mx-6 -mt-6 mb-4 flex items-center gap-2 bg-muted px-6 py-2 text-sm"><WifiOff className="size-4" aria-hidden="true" />You're offline. Showing saved info.</div>
          <Center icon={<WifiOff className="size-8" aria-hidden="true" />} title="No connection." text="Your drafts are saved on this device and will send when you're back online.">
            <button type="button" className={primary} onClick={() => go("Loading")}><RefreshCw className="size-4" aria-hidden="true" />Try again</button>
          </Center>
        </>
      );
    case "Slow connection":
      return (
        <>
          <div className="-mx-6 -mt-6 mb-4 flex items-center gap-2 bg-muted px-6 py-2 text-sm"><Signal className="size-4" aria-hidden="true" />Slow connection — loading a lighter version.</div>
          <div className="space-y-3">
            {[0, 1, 2].map(index => (
              <div key={index} className="flex gap-3 rounded-2xl border border-border p-4">
                <span className="size-10 animate-pulse rounded-xl bg-muted" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <span className="block h-3 w-1/3 animate-pulse rounded bg-muted" />
                </span>
              </div>
            ))}
          </div>
        </>
      );
    case "Not found":
      return (
        <Center icon={<SearchX className="size-8" aria-hidden="true" />} title="This door doesn't lead anywhere." text="The page may have moved, or the link was mistyped.">
          <Link href="/explore" className={primary}>Explore companies <ArrowRight className="size-4" aria-hidden="true" /></Link>
          <Link href="/" className={quiet}>Go home</Link>
        </Center>
      );
    case "Something went wrong":
      return (
        <Center icon={<AlertTriangle className="size-8" aria-hidden="true" />} title="Something went wrong on our side." text="Nothing you did. Your asks and messages are safe.">
          <button type="button" className={primary} onClick={() => go("Loading")}><RefreshCw className="size-4" aria-hidden="true" />Try again</button>
          <Link href="/safety" className={quiet}>Contact support</Link>
          <small className="text-xs text-muted-foreground">Error ref: assigned at runtime from the reported event</small>
        </Center>
      );
    case "Payment failed":
      return (
        <Center icon={<CreditCard className="size-8 text-destructive" aria-hidden="true" />} title="Payment didn't go through." text="Your card was declined by your bank. You haven't been charged, and your plan hasn't changed.">
          <Link href="/plans" className={primary}>Try another card</Link>
          <button type="button" className={quiet}>Pay with UPI</button>
          <small className="text-xs text-muted-foreground">Some banks block international payments — check your card settings.</small>
        </Center>
      );
    case "Loading":
      return (
        <div className="space-y-4">
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          {[0, 1, 2, 3].map(index => <div key={index} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      );
  }
}

export default function AppStates() {
  const [state, setState] = useState<State>("Install (Android)");

  return (
    <main data-skipwait-screen="app-states" className="page-content mx-auto max-w-3xl">
      <p className="eyebrow text-muted-foreground">App &amp; system screens</p>
      <h1 className="mt-3 text-4xl font-semibold">Every edge, designed</h1>
      <p className="mt-2 text-sm text-muted-foreground">How SkipWait behaves when installing, asking permission, or when something goes wrong.</p>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Screen state">
        {STATES.map(name => (
          <button
            key={name}
            type="button"
            aria-pressed={state === name}
            onClick={() => setState(name)}
            className={`min-h-11 rounded-full border px-4 text-xs font-semibold ${state === name ? "border-primary bg-accent" : "border-border"}`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-6 w-full max-w-sm overflow-hidden rounded-[2.5rem] border-8 border-foreground bg-background shadow-xl">
        <div className="relative flex min-h-[620px] flex-col p-6">
          <StateBody state={state} go={setState} />
        </div>
      </div>
    </main>
  );
}
