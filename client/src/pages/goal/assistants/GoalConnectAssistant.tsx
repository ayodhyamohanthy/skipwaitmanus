import { ArrowRight, Bot, Check, CircleAlert, Clock, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth, useUser } from "@/_core/auth";
import { Link, useSearch } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { GoalButton as Button, useOnlineStatus } from "@/components/goal";
import { AssistantLayout, NetworkButton, NextStep } from "./AssistantLayout";
import { Section as Panel } from "./AssistantLayout";

const PROVIDERS = ["chatgpt", "claude", "custom"] as const;
type Provider = (typeof PROVIDERS)[number];
const PROVIDER_LABEL: Record<Provider, string> = { chatgpt: "ChatGPT", claude: "Claude", custom: "this assistant" };
const isProvider = (value: string | null): value is Provider => PROVIDERS.some(provider => provider === value);

const CAN = [
  { label: "Search companies open to referrals", key: "read", locked: true },
  { label: "See your requests, alerts and replies", key: "read", locked: true },
  { label: "Draft referrals for you to review", key: "draft", locked: false },
  { label: "Send a referral — only after you approve each one", key: "send", locked: false },
  { label: "Run paid tools — shows the referral cost, you approve first", key: "credits", locked: false },
] as const;

const NEVER = [
  "Accept, pass or refer on anyone's behalf",
  "See referrers' work emails or other people's data",
  "Skip the queue or go past your open-request limit",
  "Buy plans or make payments",
] as const;

type Stage = "consent" | "approved" | "declined" | "expired" | "unverified" | "not-on-land" | "signed-out";
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

export default function GoalConnectAssistant() {
  // wouter's location is the path only; the OAuth request and state flags live in the query string.
  const queryString = useSearch();
  const { isSignedIn, isLoaded, getToken, signOut, openSignIn } = useAuth();
  const { user } = useUser();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [stage, setStage] = useState<Stage>("consent");
  // Kit default: every "It can" box starts ticked. Send and paid tools still need the member's
  // approval on each use (server-enforced), and unverified OAuth clients get read and draft only.
  const [checked, setChecked] = useState<string[]>(() => Array.from(new Set(CAN.map(item => item.key))));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStage("signed-out");
      return;
    }
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/assistants/access", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ hasAccess?: boolean }>(response, "");
        // The server owns the plan gate; follow its answer rather than naming a plan here. It wins over
        // the consent and unverified-app screens whichever check answers first, so a member without
        // Land never reaches an approve button that cannot work.
        if (response.ok && payload.hasAccess !== true) setStage(current => (current === "consent" || current === "unverified" ? "not-on-land" : current));
      } catch { /* the consent screen still renders; the plan gate re-checks on approve */ }
    })();
  }, [isSignedIn, isLoaded, fetchToken]);

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
          // skipwait.me has verified none of them: always show the unverified-app screen, never a trusted consent.
          setStage(current => (current === "consent" ? "unverified" : current));
        } else setStage("expired");
      } catch { setStage("expired"); }
    })();
  }, [oauth?.clientId, oauth?.redirectUri]);

  const finishOAuth = async (decision: "approve" | "deny") => {
    if (!oauth || working || !online) return;
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
        if (response.status === 402) { setStage("not-on-land"); return; }
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
    if (working || !online) return;
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
        if (response.status === 402) { setStage("not-on-land"); return; }
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
  const errorLine = error ? <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-g-ink"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null;

  if (!isLoaded) return <AssistantLayout screen="connect-assistant" title="Check your assistant connection" description="Checking your sign-in..."><p role="status">Please wait.</p></AssistantLayout>;

  return (
    <AssistantLayout screen="connect-assistant" title="Choose what your assistant may do" description="Check the permissions, the account and the return address before connecting.">

      {stage === "consent" ? (
        <>

          <h2 className="mt-5 text-g-heading">Connect {label} to skipwait.me</h2>
          <p className="mt-2 text-g-ink-2">{label} will be able to use skipwait.me as <strong className="text-g-ink">{email ?? "you"}</strong>. <button type="button" className="underline underline-offset-4" onClick={() => { void signOut({ returnTo: `${window.location.pathname}${window.location.search}` }).catch(() => setError("Sign out could not be completed. Please try again.")); }}>Switch account</button></p>
          {errorLine}
          <Panel className="mt-6"><h2 className="font-semibold">It can</h2><ul className="mt-2">{CAN.map(item => <li key={`${item.label}-${item.key}`}><label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-g-hairline py-2 last:border-0"><input type="checkbox" className="size-5 accent-g-ink" checked={checked.includes(item.key)} onChange={() => toggle(item.key, item.locked)} disabled={item.locked} /><span className="text-sm">{item.label}</span></label></li>)}</ul></Panel>
          <Panel className="mt-3"><h2 className="font-semibold">It can never</h2><ul className="mt-2 space-y-2 text-sm">{NEVER.map(item => <li key={item} className="flex gap-2"><X className="size-4 shrink-0 text-g-ink" />{item}</li>)}</ul></Panel>
          <p className="mt-4 flex gap-2 text-xs text-g-ink-2"><Lock className="size-4 shrink-0" /><span>Nothing it drafts is sent until you approve it in skipwait.me. You can disconnect anytime in Settings → Connected assistants.{callback ? ` Callback: ${callback}` : ""}</span></p>
          <NextStep><div className="grid gap-2 gdesk:grid-cols-2"><Button variant="outline" onClick={cancel}>Cancel connection</Button><NetworkButton variant="primary" busy={working} onClick={() => { void approve(checked); }}>{working ? "Connecting…" : "Approve"}</NetworkButton></div></NextStep>
        </>
      ) : null}

      {stage === "unverified" ? (
        <>
          <Panel>
            <ShieldAlert className="size-8 text-g-ink" />
            <h2 className="mt-3 text-g-heading">{oauth && clientName ? `“${clientName}” isn't verified by skipwait.me` : "This app isn't verified by skipwait.me"}</h2>
            <p className="mt-2 text-sm text-g-ink-2">It connected through the open MCP link. It can only read and draft until it&apos;s verified. Only continue if you trust it.</p>
            {errorLine}
            <NextStep><div className="grid gap-2 gdesk:grid-cols-2"><Button variant="outline" onClick={cancel}>Cancel</Button><NetworkButton variant="primary" busy={working} onClick={() => { setChecked(["read", "draft"]); void approve(["read", "draft"]); }}>{working ? "Connecting…" : "Continue, read & draft only"}</NetworkButton></div></NextStep>
          </Panel>
          {/* OAuth clients never reach the consent screen, so its "Callback:" footnote is shown here: the member sees where approval returns them. */}
          {callback ? <p className="mt-4 flex gap-2 text-xs text-g-ink-2"><Lock className="size-4 shrink-0" /><span>Callback: {callback}</span></p> : null}
        </>
      ) : null}

      {stage === "signed-out" ? (
        <Panel className="text-center">
          <Bot className="mx-auto size-8" />
          <h2 className="mt-3 text-g-heading">Sign in to connect {label}</h2>
          <p className="mt-2 text-sm text-g-ink-2">You'll come straight back here after signing in.</p>
          <Button variant="primary" className="mt-5" onClick={() => openSignIn()}>Sign in to skipwait.me</Button>
        </Panel>
      ) : null}

      {stage === "not-on-land" ? (
        <NextStep>
          <h2 className="text-g-heading">Assistant access is not available</h2>
          <p className="mt-3 max-w-2xl text-g-body text-g-ink-2">Connecting and applying through ChatGPT, Claude, bots or custom tools is currently not active on this account.</p>
          <Button asChild variant="primary" className="mt-4"><Link href="/explore">Find a referral yourself</Link></Button>
        </NextStep>
      ) : null}

      {stage === "expired" ? (
        <Panel className="text-center">
          <Clock className="mx-auto size-8" />
          <h2 className="mt-3 text-g-heading">This link has expired</h2>
          <p className="mt-2 text-sm text-g-ink-2">Go back to {label} and start the connection again. It takes a few seconds.</p>
        </Panel>
      ) : null}

      {stage === "approved" ? (
        <Panel className="text-center">

          <h2 className="mt-3 text-g-heading">{label} is connected</h2>
          <p className="mt-2 text-sm text-g-ink-2">{oauth ? `Taking you back to ${label}…` : "You can review or disconnect it anytime."}</p>
          <Button asChild variant="outline" className="mt-5"><Link href="/assistants">Manage assistants</Link></Button>
        </Panel>
      ) : null}

      {stage === "declined" ? (
        <Panel className="text-center">
          <ShieldAlert className="mx-auto size-8" />
          <h2 className="mt-3 text-g-heading">Connection cancelled</h2>
          <p className="mt-2 text-sm text-g-ink-2">{label} has no access to your skipwait.me account.</p>
        </Panel>
      ) : null}
    </AssistantLayout>
  );
}
