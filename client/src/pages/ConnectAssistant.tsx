import { ArrowRight, Bot, Check, CircleAlert, Clock, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Link, useSearch } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button, buttonVariants } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";

const PROVIDERS = ["chatgpt", "claude", "custom"] as const;
type Provider = (typeof PROVIDERS)[number];
const PROVIDER_LABEL: Record<Provider, string> = { chatgpt: "ChatGPT", claude: "Claude", custom: "this assistant" };
const isProvider = (value: string | null): value is Provider => PROVIDERS.some(provider => provider === value);

const CAN = [
  { label: "Search companies open to referrals", key: "read", locked: true },
  { label: "See your requests, alerts and replies", key: "read", locked: true },
  { label: "Draft asks for you to review", key: "draft", locked: false },
  { label: "Send an ask — only after you approve each one", key: "send", locked: false },
  { label: "Run paid tools — shows the credit cost, you approve first", key: "credits", locked: false },
] as const;

const NEVER = [
  "Accept, pass or refer on anyone's behalf",
  "See referrers' work emails or other people's data",
  "Skip the queue or go past your open-request limit",
  "Buy plans or credits",
] as const;

type Stage = "consent" | "approved" | "declined" | "expired" | "unverified" | "not-on-max" | "signed-out";
type OAuthRequest = { clientId: string; redirectUri: string; codeChallenge: string; method: string; state: string };

/** OAuth mode: an assistant sent the member here with a registered client, an exact redirect and a PKCE challenge. */
function readOAuthRequest(query: URLSearchParams): OAuthRequest | null {
  const clientId = query.get("client_id");
  const redirectUri = query.get("redirect_uri");
  const codeChallenge = query.get("code_challenge");
  if (!clientId || !redirectUri || !codeChallenge || query.get("response_type") !== "code") return null;
  return { clientId, redirectUri, codeChallenge, method: query.get("code_challenge_method") ?? "", state: query.get("state") ?? "" };
}

function callbackHost(redirectUri: string): string | null {
  try { return new URL(redirectUri).host || null; } catch { return null; }
}

export default function ConnectAssistant() {
  // wouter's location is the path only; the OAuth request and state flags live in the query string.
  const queryString = useSearch();
  const { isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();
  const fetchToken = usePersistFn(getToken);
  const [stage, setStage] = useState<Stage>("consent");
  const [checked, setChecked] = useState<string[]>(["read", "draft"]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) {
      setStage("signed-out");
      return;
    }
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/assistants/access", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ plan?: string }>(response, "");
        if (response.ok && payload.plan !== "max") setStage(current => (current === "consent" ? "not-on-max" : current));
      } catch { /* the consent screen still renders; the plan gate re-checks on approve */ }
    })();
  }, [isSignedIn, fetchToken]);

  const query = new URLSearchParams(queryString);
  const requested = query.get("provider");
  const provider: Provider = isProvider(requested) ? requested : "chatgpt";
  const oauth = readOAuthRequest(query);
  const [clientName, setClientName] = useState<string | null>(null);
  const label = oauth && clientName ? clientName : PROVIDER_LABEL[provider];
  const callback = oauth ? callbackHost(oauth.redirectUri) : null;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  useEffect(() => {
    if (!oauth) return;
    void (async () => {
      try {
        const response = await fetch(`/api/oauth/client?client_id=${encodeURIComponent(oauth.clientId)}&redirect_uri=${encodeURIComponent(oauth.redirectUri)}`);
        const payload = await readApiJson<{ clientName?: string }>(response, "");
        if (response.ok && typeof payload.clientName === "string") {
          setClientName(payload.clientName);
          // OAuth clients register themselves (dynamic registration), so the name is self-declared and
          // SkipWait has verified none of them: always show the unverified-app screen, never a trusted consent.
          setStage(current => (current === "consent" ? "unverified" : current));
        } else setStage("expired");
      } catch { setStage("expired"); }
    })();
  }, [oauth?.clientId, oauth?.redirectUri]);

  const finishOAuth = async (decision: "approve" | "deny") => {
    if (!oauth || working) return;
    setWorking(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/oauth/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ client_id: oauth.clientId, redirect_uri: oauth.redirectUri, code_challenge: oauth.codeChallenge, code_challenge_method: oauth.method, state: oauth.state, decision }),
      });
      const payload = await readApiJson<{ error?: string; redirectTo?: string }>(response, "We could not connect this assistant");
      if (!response.ok || !payload.redirectTo) {
        if (response.status === 402) { setStage("not-on-max"); return; }
        throw new Error(payload.error || "We could not connect this assistant");
      }
      if (decision === "approve") setStage("approved");
      else setStage("declined");
      window.location.assign(payload.redirectTo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not connect this assistant");
    } finally {
      setWorking(false);
    }
  };

  const approve = async (scopes: string[]) => {
    if (oauth) { await finishOAuth("approve"); return; }
    if (working) return;
    setWorking(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/assistants/connections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ provider, appName: label, scopes: scopes.length > 0 ? scopes : ["read", "draft"] }),
      });
      const payload = await readApiJson<{ error?: string }>(response, "We could not connect this assistant");
      if (!response.ok) {
        if (response.status === 402) { setStage("not-on-max"); return; }
        throw new Error(payload.error || "We could not connect this assistant");
      }
      setStage("approved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not connect this assistant");
    } finally {
      setWorking(false);
    }
  };

  const cancel = () => { if (oauth) void finishOAuth("deny"); else setStage("declined"); };
  const toggle = (key: string, locked: boolean) => {
    if (locked) return;
    setChecked(current => (current.includes(key) ? current.filter(item => item !== key) : [...current, key]));
  };
  const errorLine = error ? <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null;

  return (
    <main data-skipwait-screen="connect-assistant" className="mx-auto min-h-screen max-w-lg px-4 py-8 sm:py-14">
      <Link href="/" className="wordmark mb-6 inline-block text-xl">SkipWait<span className="brand-dot">.</span></Link>

      {stage === "consent" ? (
        <>
          <div className="flex items-center gap-3"><span className="grid size-14 place-items-center rounded-2xl bg-muted"><Bot className="size-7" /></span><ArrowRight aria-hidden className="size-5 text-muted-foreground" /><span className="grid size-14 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">S</span></div>
          <h1 className="mt-5 text-3xl font-semibold">Connect {label} to SkipWait</h1>
          <p className="mt-2 text-muted-foreground">{label} will be able to use SkipWait as <strong className="text-foreground">{email ?? "you"}</strong>. <button type="button" className="text-link" onClick={() => { void signOut({ returnTo: `${window.location.pathname}${window.location.search}` }).catch(() => setError("Sign out could not be completed. Please try again.")); }}>Switch account</button></p>
          {errorLine}
          <Panel className="mt-6"><h2 className="font-semibold">It can</h2><ul className="mt-2">{CAN.map(item => <li key={`${item.label}-${item.key}`}><label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border py-2 last:border-0"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={checked.includes(item.key)} onChange={() => toggle(item.key, item.locked)} disabled={item.locked} /><span className="text-sm">{item.label}</span></label></li>)}</ul></Panel>
          <Panel tone="muted" className="mt-3"><h2 className="font-semibold">It can never</h2><ul className="mt-2 space-y-2 text-sm">{NEVER.map(item => <li key={item} className="flex gap-2"><X className="size-4 shrink-0 text-destructive" />{item}</li>)}</ul></Panel>
          <p className="mt-4 flex gap-2 text-xs text-muted-foreground"><Lock className="size-4 shrink-0" /><span>Nothing it drafts is sent until you approve it in SkipWait. You can disconnect anytime in Settings → Connected assistants.{callback ? ` Callback: ${callback}` : ""}</span></p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2"><Button variant="outline" size="lg" onClick={cancel}>Cancel connection</Button><Button size="lg" disabled={working} onClick={() => { void approve(checked); }}>{working ? "Connecting…" : "Approve"}</Button></div>
        </>
      ) : null}

      {stage === "unverified" ? (
        <Panel className="border-destructive">
          <ShieldAlert className="size-8 text-destructive" />
          <h1 className="mt-3 text-2xl font-semibold">{oauth && clientName ? `“${clientName}” isn't verified by SkipWait` : "This app isn't verified by SkipWait"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{oauth && clientName ? `It named itself “${clientName}”${callback ? ` and will send you back to ${callback}` : ""}. SkipWait has not checked who runs it.` : "It connected through the open MCP link."} It can only read and draft. Only continue if you started this from an app you trust.</p>
          {errorLine}
          <div className="mt-5 grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={cancel}>Cancel</Button><Button disabled={working} onClick={() => { setChecked(["read", "draft"]); void approve(["read", "draft"]); }}>{working ? "Connecting…" : "Continue, read & draft only"}</Button></div>
        </Panel>
      ) : null}

      {stage === "signed-out" ? (
        <Panel className="text-center">
          <Bot className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">Sign in to connect {label}</h1>
          <p className="mt-2 text-sm text-muted-foreground">You'll come straight back here after signing in.</p>
          <SignInButton><button type="button" className={buttonVariants({ size: "lg", className: "mt-5 w-full" })}>Sign in to SkipWait</button></SignInButton>
        </Panel>
      ) : null}

      {stage === "not-on-max" ? (
        <Panel className="text-center">
          <ShieldCheck className="mx-auto size-8 text-primary" />
          <h1 className="mt-3 text-2xl font-semibold">Assistants need Max</h1>
          <p className="mt-2 text-sm text-muted-foreground">Signing in, connecting and applying through ChatGPT, Claude, bots or your own tools is part of Max.</p>
          <div className="mt-5 grid gap-2"><Button asChild size="lg"><Link href="/plans">Upgrade to Max</Link></Button><Button variant="ghost" asChild><Link href="/explore">Keep using SkipWait yourself</Link></Button></div>
        </Panel>
      ) : null}

      {stage === "expired" ? (
        <Panel className="text-center">
          <Clock className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">This link has expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">Go back to {label} and start the connection again. It takes a few seconds.</p>
        </Panel>
      ) : null}

      {stage === "approved" ? (
        <Panel className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent"><Check className="size-8 text-primary" /></span>
          <h1 className="mt-3 text-2xl font-semibold">{label} is connected</h1>
          <p className="mt-2 text-sm text-muted-foreground">{oauth ? `Taking you back to ${label}…` : "You can review or disconnect it anytime."}</p>
          <Button asChild variant="outline" className="mt-5"><Link href="/assistants">Manage assistants</Link></Button>
        </Panel>
      ) : null}

      {stage === "declined" ? (
        <Panel className="text-center">
          <ShieldAlert className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">Connection cancelled</h1>
          <p className="mt-2 text-sm text-muted-foreground">{label} has no access to your SkipWait account.</p>
        </Panel>
      ) : null}
    </main>
  );
}
