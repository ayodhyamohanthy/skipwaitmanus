// Goal /reset-password (D-048-p3-signin, packet section 6 step 4). The same
// three server routes as the kit page: GET /api/auth/password/reset/verify to
// check the link, POST /api/auth/password/reset/confirm to finish, and the
// server's three password rules. The token is read once from the address bar,
// kept in memory and never rendered, logged or put in a link (section 4 rule
// 10). The done panel says only what the server did: the confirm route signs
// other sessions out and grants none, so this page never says "You're signed
// in" (section 3 rule 7, section 4 rule 7).
import { Check, Circle, CircleAlert, Eye, EyeOff } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalField, GoalTextInput } from "@/components/goal/GoalField";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalAuthFrame, NETWORK_MESSAGE, serverWords } from "./GoalAuthFrame";

export const GOAL_PAGE = { goalLine: "Set a new password and get back in." } as const;

type LinkState = "checking" | "valid" | "invalid" | "unreachable";

function tokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

function codeOf(body: unknown): string {
  return body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : "";
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-g-meta text-g-crimson">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{text}
    </p>
  );
}

export default function GoalResetPassword() {
  const [token] = useState(tokenFromUrl);
  const [linkState, setLinkState] = useState<LinkState>(() => (token ? "checking" : "invalid"));
  const [expiredReason, setExpiredReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const checkLink = useCallback(async (signal: { active: boolean }) => {
    setLinkState("checking");
    try {
      const response = await fetch(`/api/auth/password/reset/verify?token=${encodeURIComponent(token)}`, { credentials: "include" });
      const payload: unknown = await response.json().catch(() => ({}));
      const valid = response.ok && Boolean(payload && typeof payload === "object" && (payload as { valid?: unknown }).valid === true);
      if (signal.active) setLinkState(valid ? "valid" : "invalid");
    } catch {
      if (signal.active) setLinkState("unreachable");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const signal = { active: true };
    void checkLink(signal);
    return () => { signal.active = false; };
  }, [token, checkLink]);

  const rules = [
    ["At least 10 characters", password.length >= 10],
    ["A number or symbol", /[\d\W]/.test(password)],
    ["Passwords match", password.length > 0 && password === confirm],
  ] as const;
  const rulesPass = rules.every(rule => rule[1]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!rulesPass || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password, confirm }),
      });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = serverWords(payload, "We could not update the password. Try again.");
        const code = codeOf(payload);
        if (code === "expired" || code === "consumed") { setExpiredReason(message); setLinkState("invalid"); return; }
        setError(message);
        return;
      }
      setPassword(""); setConfirm("");
      setDone(true);
    } catch {
      setError(NETWORK_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  let body: ReactNode;
  if (linkState === "checking") {
    body = <p role="status" className="text-g-meta text-g-ink-2">Checking this link…</p>;
  } else if (linkState === "unreachable") {
    body = (
      <GoalNextStep>
        <h2 className="mt-3 text-g-label text-g-ink">We could not check this link</h2>
        <p className="mt-1 text-g-meta text-g-ink-2">{NETWORK_MESSAGE} The link itself may still work.</p>
        <GoalButton variant="primary" className="mt-4 w-full" onClick={() => { void checkLink({ active: true }); }}>Try again</GoalButton>
      </GoalNextStep>
    );
  } else if (linkState === "invalid") {
    body = (
      <GoalNextStep>
        <h2 className="mt-3 text-g-label text-g-ink">This link has expired or was already used</h2>
        <p className="mt-1 text-g-meta text-g-ink-2">{expiredReason || "Reset links work for 1 hour, once. Request a new one and use the newest email."}</p>
        <GoalButton variant="primary" asChild className="mt-4 w-full"><Link href="/forgot-password">Send a new link</Link></GoalButton>
      </GoalNextStep>
    );
  } else if (done) {
    body = (
      <GoalNextStep>
        <h2 className="mt-3 text-g-label text-g-ink">Reset complete</h2>
        <p className="mt-1 text-g-meta text-g-ink-2">Every device signed in to this account was signed out for safety. Sign in again to continue.</p>
        <GoalButton variant="primary" asChild className="mt-4 w-full"><Link href="/sign-in">Go to sign in</Link></GoalButton>
      </GoalNextStep>
    );
  } else {
    body = (
      <GoalNextStep reason="Choose a password you do not use anywhere else.">
        <form className="mt-4 grid gap-3" onSubmit={submit} noValidate>
          <GoalField label="New password" htmlFor="reset-password">
            <div className="relative">
              <GoalTextInput id="reset-password" type={show ? "text" : "password"} autoComplete="new-password" value={password} className="pr-12"
                onChange={event => { setPassword(event.target.value); setError(""); }} />
              <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(value => !value)}
                className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-g-ink-2 hover:text-g-ink">
                {show ? <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.75} /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.75} />}
              </button>
            </div>
          </GoalField>
          <GoalField label="Confirm password" htmlFor="reset-confirm">
            <GoalTextInput id="reset-confirm" type={show ? "text" : "password"} autoComplete="new-password" value={confirm}
              onChange={event => { setConfirm(event.target.value); setError(""); }} />
          </GoalField>
          <ul className="grid gap-1" aria-label="Password rules">
            {rules.map(([label, passed]) => (
              <li key={label} data-passed={passed ? "true" : "false"} className={`flex items-center gap-2 text-g-meta ${passed ? "text-g-ink" : "text-g-ink-3"}`}>
                {passed ? <Check aria-hidden="true" className="size-4" strokeWidth={1.75} /> : <Circle aria-hidden="true" className="size-4" strokeWidth={1.75} />}
                {label}
              </li>
            ))}
          </ul>
          {error ? <ErrorLine text={error} /> : null}
          <GoalButton type="submit" variant="primary" className="w-full" busy={busy} busyLabel="Updating…" disabledReason={rulesPass ? undefined : "Meet the three password rules first"}>Update password</GoalButton>
        </form>
      </GoalNextStep>
    );
  }

  return (
    <GoalAuthFrame screen="reset-password" page="reset-password" goalLine={GOAL_PAGE.goalLine} back={{ href: "/sign-in", label: "Back to sign in" }}>
      <div className="mt-8">{body}</div>
    </GoalAuthFrame>
  );
}
