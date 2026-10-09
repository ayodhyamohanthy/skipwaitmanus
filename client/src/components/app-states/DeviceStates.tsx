// Kit v4 /app-states device screens (install sheets, push permission) wired to
// the real browser APIs. Nothing here pretends: the Android sheet only opens the
// browser's own install prompt when the browser offered one, and the push screen
// only sets the browser permission (SkipWait sends no device push today).
import { useEffect, useState, type ReactNode } from "react";
import { Bell, Download, Share, X } from "lucide-react";
import { Button } from "@/components/kit/button";

type InstallOutcome = { outcome: "accepted" | "dismissed" };
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<InstallOutcome> };

export function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function" && "userChoice" in event;
}

const isStandalone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;

/** The browser's deferred install prompt, captured while this screen is open. */
function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const capture = (event: Event) => {
      if (!isInstallPromptEvent(event)) return;
      event.preventDefault();
      setPromptEvent(event);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);
  return [promptEvent, setPromptEvent] as const;
}

/** Kit Center: the icon disc, title, text and stacked actions of a full-phone state. */
export function Center({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return <div className="m-auto text-center"><span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-muted">{icon}</span><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-2 text-muted-foreground">{text}</p>{children && <div className="mt-6 grid gap-2">{children}</div>}</div>;
}

export function Backdrop() {
  return <div className="space-y-3 opacity-40"><div className="h-6 w-32 rounded-[0.25rem] bg-muted" /><div className="h-24 rounded-2xl bg-muted" /><div className="h-24 rounded-2xl bg-muted" /></div>;
}

function Sheet({ children }: { children: ReactNode }) {
  return <div className="absolute inset-x-3 bottom-3 rounded-3xl border border-border bg-card p-5 shadow-lg">{children}</div>;
}

export function InstallAndroidSheet() {
  const [promptEvent, setPromptEvent] = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState("");
  if (dismissed) return <Backdrop />;
  const install = async () => {
    if (isStandalone()) { setStatus("SkipWait is already installed on this device."); return; }
    if (!promptEvent) { setStatus("Your browser hasn't offered install here. Use its menu: Install app, or Add to Home screen."); return; }
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setStatus(choice.outcome === "accepted" ? "Installing SkipWait on this device." : "Install dismissed. You can install later from the browser menu.");
    } catch {
      setStatus("The install prompt didn't open. Use the browser menu instead.");
    } finally {
      setPromptEvent(null);
    }
  };
  return <><Backdrop /><Sheet>
    <button type="button" onClick={() => setDismissed(true)} className="absolute right-2 top-2 grid size-11 place-items-center" aria-label="Dismiss"><X className="size-5" /></button>
    <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">S.</span><span><strong className="block">Install SkipWait</strong><small className="text-muted-foreground">One tap from your home screen</small></span></div>
    <Button className="mt-4 w-full" onClick={() => { void install(); }}><Download />Install app</Button>
    {status ? <p role="status" className="mt-2 text-center text-sm text-muted-foreground">{status}</p> : null}
    <button type="button" onClick={() => setDismissed(true)} className="mt-2 w-full text-sm text-muted-foreground">Not now</button>
  </Sheet></>;
}

export function InstallIphoneSheet() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return <Backdrop />;
  return <><Backdrop /><Sheet>
    <strong className="block">Add SkipWait to your Home Screen</strong>
    <ol className="mt-3 space-y-3 text-sm">
      <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs">1</span>Tap <Share className="size-4" /> Share in Safari</li>
      <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs">2</span>Choose “Add to Home Screen”</li>
      <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs">3</span>Open it from your Home Screen</li>
    </ol>
    <button type="button" onClick={() => setDismissed(true)} className="mt-4 w-full text-sm text-muted-foreground">Got it</button>
  </Sheet></>;
}

const PERMISSION_RESULT: Record<NotificationPermission, string> = {
  granted: "Notifications are allowed in this browser.",
  denied: "Notifications are blocked. Allow them in your browser settings to change that.",
  default: "Notifications stay off until you allow them.",
};

export function PushPermission() {
  const [status, setStatus] = useState("");
  const request = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) { setStatus("This browser doesn't support notifications."); return; }
    try {
      setStatus(PERMISSION_RESULT[await Notification.requestPermission()]);
    } catch {
      setStatus("The browser didn't show the permission prompt. Try again from your browser settings.");
    }
  };
  return <Center icon={<Bell className="size-8 text-primary" />} title="Know the moment a door opens." text="This only sets your browser's permission. Accepts and replies reach you by email and in Alerts. Never marketing.">
    {status ? <p role="status" className="text-sm font-semibold">{status}</p> : <><Button onClick={() => { void request(); }}>Turn on notifications</Button><Button variant="ghost" onClick={() => setStatus(PERMISSION_RESULT.default)}>Maybe later</Button></>}
  </Center>;
}
