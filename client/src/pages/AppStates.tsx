import { AlertTriangle, ArrowRight, Bell, CreditCard, Download, RefreshCw, SearchX, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

const STATES = ["Install (Android)", "Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"] as const;
type State = (typeof STATES)[number];

export default function AppStates() {
  const [state, setState] = useState<State>("Install (Android)");
  const [canInstall, setCanInstall] = useState(false);
  const [push, setPush] = useState<string>("");

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setCanInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const requestPush = async () => {
    if (!("Notification" in window)) { setPush("This browser doesn't support push notifications."); return; }
    const result = await Notification.requestPermission();
    setPush(result === "granted" ? "Push is on for this device." : result === "denied" ? "Push is blocked. Allow it in your browser settings to change that." : "Push stays off until you allow it.");
  };

  return (
    <main data-skipwait-screen="app-states" className="page-content">
      <div className="mb-6"><span className="eyebrow">App &amp; system screens</span><h1 className="mt-2 text-4xl font-semibold">Every edge, designed</h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">How SkipWait behaves when installing, asking permission, or when something goes wrong.</p></div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="App state">
        {STATES.map(value => (
          <button key={value} type="button" role="tab" aria-selected={state === value} onClick={() => setState(value)} className={`min-h-11 rounded-full border px-4 text-sm ${state === value ? "border-[var(--primary)] bg-[var(--primary)]/5 font-semibold" : "border-[var(--border)]"}`}>{value}</button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-8 border-[var(--foreground)] bg-[var(--background)] shadow-xl">
        <div className="relative flex min-h-[620px] flex-col p-6">
          {state === "Install (Android)" ? <Center icon={<Download />} title="Install SkipWait" text="Faster opening, push notifications, and offline drafts."><button type="button" disabled={!canInstall} className="brand-button w-full">{canInstall ? "Install app" : "Open in Chrome to install"}</button>{!canInstall ? <p className="text-xs text-[var(--muted-foreground)]">Install appears here when your browser offers it.</p> : null}</Center> : null}
          {state === "Install (iPhone)" ? <Center icon={<Download />} title="Add to Home Screen" text="Open this page in Safari, tap Share, then Add to Home Screen." /> : null}
          {state === "Push permission" ? <Center icon={<Bell />} title="Stay in the loop" text="Push only for asks, messages, and account updates. Never marketing.">{push ? <p role="status" className="text-sm font-semibold">{push}</p> : <button type="button" onClick={() => { void requestPush(); }} className="brand-button w-full">Allow push</button>}<button type="button" className="text-sm font-semibold text-[var(--muted-foreground)]">Not now</button></Center> : null}
          {state === "Offline" ? <Center icon={<WifiOff />} title="You're offline" text="Saved pages remain available. Drafts send when you reconnect." /> : null}
          {state === "Slow connection" ? <Center icon={<RefreshCw />} title="Taking longer than usual" text="Still trying. Check your connection or try again." ><button type="button" className="brand-button w-full">Try again</button></Center> : null}
          {state === "Not found" ? <Center icon={<SearchX />} title="This door doesn't lead anywhere" text="The page moved, or the link is wrong."><Link href="/explore" className="brand-button w-full">Explore companies <ArrowRight /></Link><Link href="/" className="text-sm font-semibold">Back to home</Link></Center> : null}
          {state === "Something went wrong" ? <Center icon={<AlertTriangle />} title="Something went wrong on our side" text="Nothing was lost. Try again, or go home."><button type="button" className="brand-button w-full">Try again</button><Link href="/" className="text-sm font-semibold">Back to home</Link></Center> : null}
          {state === "Payment failed" ? <Center icon={<CreditCard />} title="Payment didn't go through" text="No credits were added and nothing was charged."><Link href="/premium" className="brand-button w-full">Try again <ArrowRight /></Link><Link href="/support" className="text-sm font-semibold">Contact support</Link></Center> : null}
          {state === "Loading" ? <div className="m-auto w-full animate-pulse space-y-3" aria-label="Loading"><div className="h-8 w-2/3 rounded-lg bg-[var(--muted)]" /><div className="h-4 w-full rounded-lg bg-[var(--muted)]" /><div className="h-4 w-5/6 rounded-lg bg-[var(--muted)]" /><div className="mt-6 h-12 w-full rounded-2xl bg-[var(--muted)]" /></div> : null}
        </div>
      </div>
    </main>
  );
}

function Center({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return <div className="m-auto text-center"><span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[var(--muted)]">{icon}</span><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-2 text-[var(--muted-foreground)]">{text}</p>{children ? <div className="mt-6 grid gap-2">{children}</div> : null}</div>;
}
