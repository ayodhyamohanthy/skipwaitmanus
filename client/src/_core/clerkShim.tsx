import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Local development replacement for @clerk/react.
 *
 * Active ONLY when the app is built without a Clerk publishable key
 * (vite.config.ts aliases @clerk/react here in that case). It preserves the
 * Clerk hook surface used by this codebase — ClerkProvider, useAuth, useUser,
 * useClerk, SignInButton, and the legacy useSignIn/useSignUp stubs — backed by
 * the server's local dev session (server/_core/devAuth.ts), which issues the
 * same app_session_id JWT used by real OAuth logins.
 *
 * It never runs in the managed production environment, where real Clerk keys
 * are configured and the real @clerk/react package is bundled instead.
 */

type DevAccount = { id: number; name: string | null; email: string | null; role?: "user" | "admin" };

type DevClerkUser = {
  id: string;
  fullName: string | null;
  imageUrl: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: Array<{ id: string; emailAddress: string; verification: { status: "verified" } }>;
};

type ShimState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  account: DevAccount | null;
  user: DevClerkUser | null;
};

type ShimContextValue = ShimState & {
  signIn: (input: { name?: string; email?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  openSignIn: () => void;
};

const DEV_SIGNIN_EVENT = "skipwait:dev-signin";
const emptyState: ShimState = { isLoaded: false, isSignedIn: false, account: null, user: null };

const ShimContext = createContext<ShimContextValue | null>(null);

function userFromAccount(account: DevAccount): DevClerkUser {
  const primary = account.email
    ? { id: `dev-email-${account.email}`, emailAddress: account.email, verification: { status: "verified" as const } }
    : null;
  return {
    id: `dev_${account.id}`,
    fullName: account.name,
    imageUrl: null,
    primaryEmailAddress: primary ? { emailAddress: primary.emailAddress } : null,
    emailAddresses: primary ? [primary] : [],
  };
}

export function ClerkProvider({ children }: { children: React.ReactNode; publishableKey?: string }) {
  const [state, setState] = useState<ShimState>(emptyState);
  const [widgetOpen, setWidgetOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/dev-auth/session", { credentials: "include" });
        const payload = (await response.json().catch(() => ({}))) as { signedIn?: boolean; account?: DevAccount };
        if (active) setState(payload.signedIn && payload.account ? { isLoaded: true, isSignedIn: true, account: payload.account, user: userFromAccount(payload.account) } : { isLoaded: true, isSignedIn: false, account: null, user: null });
      } catch {
        if (active) setState({ ...emptyState, isLoaded: true });
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const open = () => setWidgetOpen(true);
    window.addEventListener(DEV_SIGNIN_EVENT, open);
    return () => window.removeEventListener(DEV_SIGNIN_EVENT, open);
  }, []);

  const signIn = useCallback(async (input: { name?: string; email?: string }) => {
    const response = await fetch("/api/dev-auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) });
    const payload = (await response.json().catch(() => ({}))) as { signedIn?: boolean; account?: DevAccount; error?: string };
    if (!response.ok || !payload.signedIn || !payload.account) throw new Error(payload.error || "Local dev sign-in failed");
    setState({ isLoaded: true, isSignedIn: true, account: payload.account, user: userFromAccount(payload.account) });
    setWidgetOpen(false);
  }, []);

  const signOut = useCallback(async () => {
    try { await fetch("/api/dev-auth/logout", { method: "POST", credentials: "include" }); } catch { /* local only */ }
    setState({ isLoaded: true, isSignedIn: false, account: null, user: null });
    window.location.reload();
  }, []);

  const openSignIn = useCallback(() => setWidgetOpen(true), []);

  const value = useMemo<ShimContextValue>(() => ({ ...state, signIn, signOut, openSignIn }), [state, signIn, signOut, openSignIn]);

  return (
    <ShimContext.Provider value={value}>
      {children}
      <DevAuthWidget open={widgetOpen} onOpenChange={setWidgetOpen} signedIn={state.isSignedIn} account={state.account} onSignIn={signIn} onSignOut={signOut} />
    </ShimContext.Provider>
  );
}

function useShim(hookName: string): ShimContextValue {
  const value = useContext(ShimContext);
  if (!value) throw new Error(`${hookName} must be used inside <ClerkProvider>`);
  return value;
}

export function useAuth() {
  const shim = useShim("useAuth");
  return {
    isLoaded: shim.isLoaded,
    isSignedIn: shim.isSignedIn,
    userId: shim.account ? `dev_${shim.account.id}` : null,
    getToken: async () => null,
    signOut: shim.signOut,
  };
}

export function useUser() {
  const shim = useShim("useUser");
  return { isLoaded: shim.isLoaded, isSignedIn: shim.isSignedIn, user: shim.user };
}

export function useClerk() {
  const shim = useShim("useClerk");
  return { openSignIn: shim.openSignIn, signOut: shim.signOut };
}

export function SignInButton({ children, className }: { mode?: "modal" | "redirect"; children?: React.ReactNode; className?: string }) {
  const shim = useShim("SignInButton");
  return (
    <button type="button" className={className} onClick={shim.openSignIn}>
      {children ?? "Sign in"}
    </button>
  );
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  const shim = useShim("SignedIn");
  return shim.isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  const shim = useShim("SignedOut");
  return shim.isSignedIn ? null : <>{children}</>;
}

function DevAuthWidget({ open, onOpenChange, signedIn, account, onSignIn, onSignOut }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
  account: DevAccount | null;
  onSignIn: (input: { name?: string; email?: string }) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        data-testid="dev-auth-widget"
        onClick={() => onOpenChange(true)}
        className="fixed bottom-3 left-3 z-50 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-blue-200 hover:text-[#0B57D0]"
      >
        {signedIn ? `Dev session: ${account?.name ?? account?.email ?? "user"}` : "Local dev sign-in"}
      </button>
    );
  }

  const submit = () => {
    setBusy(true);
    setError("");
    onSignIn({ name: name.trim() || undefined, email: email.trim() || undefined })
      .catch(signInError => setError(signInError instanceof Error ? signInError.message : "Local dev sign-in failed"))
      .finally(() => setBusy(false));
  };

  return (
    <div data-testid="dev-auth-widget" className="fixed bottom-3 left-3 z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Local dev auth</p>
        <button type="button" aria-label="Close dev sign-in" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-600">✕</button>
      </div>
      {signedIn ? (
        <>
          <p className="mt-3 text-sm font-semibold text-slate-900">{account?.name ?? "Dev user"}</p>
          <p className="text-xs text-slate-500">{account?.email ?? "No email on the local session"}</p>
          <button type="button" disabled={busy} onClick={() => { void onSignOut(); }} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-[#0B57D0] disabled:opacity-50">Sign out</button>
        </>
      ) : (
        <>
          <label className="mt-3 block text-xs font-semibold text-slate-600" htmlFor="dev-auth-name">Display name</label>
          <input id="dev-auth-name" value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0B57D0]" placeholder="Dev User" />
          <label className="mt-2 block text-xs font-semibold text-slate-600" htmlFor="dev-auth-email">Email (optional)</label>
          <input id="dev-auth-email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0B57D0]" placeholder="you@company.com" inputMode="email" />
          <button type="button" disabled={busy} onClick={submit} className="mt-3 w-full rounded-lg bg-[#0B57D0] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Creating session…" : "Create local session"}</button>
          {error && <p role="alert" className="mt-2 text-xs leading-5 text-rose-700">{error}</p>}
          <p className="mt-2 text-[11px] leading-4 text-slate-500">Creates a session on this machine only. Real Clerk sign-in returns when CLERK keys are configured.</p>
        </>
      )}
    </div>
  );
}

/**
 * Legacy OTP surface. The real work-email OTP flow requires Clerk to deliver
 * email codes; in local dev these stubs fail with an explanatory message that
 * WorkEmailSignIn renders inline.
 */
const legacyUnavailable = (action: string) => async () => {
  throw new Error(`${action} needs real Clerk keys — local dev cannot send work-email codes. Set CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY (see .env.example), or use the local dev session.`);
};

const legacySignInStub = {
  create: legacyUnavailable("Work-email sign-in"),
  prepareFirstFactor: legacyUnavailable("Work-email code delivery"),
  attemptFirstFactor: legacyUnavailable("Work-email code verification"),
};

const legacySignUpStub = {
  create: legacyUnavailable("Work-email enrollment"),
  prepareEmailAddressVerification: legacyUnavailable("Work-email code delivery"),
  attemptEmailAddressVerification: legacyUnavailable("Work-email code verification"),
};

export function useSignIn() {
  return { isLoaded: true, signIn: legacySignInStub, setActive: async () => {} };
}

export function useSignUp() {
  return { isLoaded: true, signUp: legacySignUpStub, setActive: async () => {} };
}
