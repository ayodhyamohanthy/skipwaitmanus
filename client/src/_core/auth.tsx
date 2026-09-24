import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthKitProvider as WorkOSAuthKitProvider, useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";
import { setGlobalAccessToken } from "./accessToken";
import { trpc } from "@/lib/trpc";
import { identifyClarity } from "@/lib/clarity";
import { smokeState } from "@/contexts/smokeRuntime";
import { safeAuthReturnTo } from "@shared/authReturnTo";

/**
 * WorkOS AuthKit provider exposing the app's auth hook surface.
 *
 * ~20 call sites import useAuth/useUser/SignInButton from @/_core/auth.
 * Production auth is WorkOS AuthKit, so this module re-exposes the app's
 * shared hook surface on top of the WorkOS context.
 *
 * - useAuth()  -> { isLoaded, isSignedIn, userId, getToken, signOut, openSignIn }
 * - useUser()  -> { isLoaded, isSignedIn, user } (compat user shape)
 * - openSignIn routes to AuthKit; SignInButton navigates to AuthKit.
 * - getToken() resolves null: server routes authenticate via the
 *   app_session_id cookie (AuthKit fetch sends credentials: include).
 */

type EmailAddress = { emailAddress: string; verification: { status: string } };
type CompatUser = { id: string; fullName: string | null; imageUrl: string | null; primaryEmailAddress: { emailAddress: string } | null; emailAddresses: EmailAddress[] } | null;

type CompatValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  user: CompatUser;
  openSignIn: (options?: { returnTo?: string }) => void;
};

type CompatSdkAuth = {
  isLoading: boolean;
  user: { id: string; email: string; emailVerified: boolean; firstName?: string | null; lastName?: string | null; profilePictureUrl?: string | null } | null;
  signIn: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  signOut: (options?: { navigate: false }) => Promise<void>;
};

export const SDK_WAIT_MS = 2500;

const CompatContext = createContext<CompatValue | null>(null);

function CompatShell({ children, sdkAuth }: { children: React.ReactNode; sdkAuth: CompatSdkAuth }) {
  const auth = sdkAuth;
  // Server cookie session is the source of truth: it works for BOTH auth planes
  // (WorkOS AuthKit sign-in AND the referrer work-email OTP login). The AuthKit
  // SDK only knows its own PKCE session, so OTP users would look signed out.
  const synthetic = smokeState().active ? smokeState().identity : undefined;
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false, enabled: !synthetic });
  const utils = trpc.useUtils();

  const serverUser = meQuery.data ?? null;
  const signedIn = Boolean(synthetic) || Boolean(serverUser) || Boolean(auth.user);
  // The server cookie (auth.me) is the source of truth. The AuthKit SDK's own
  // session probe can hang for 15-25s for signed-out visitors (QA, Sep 24:
  // /premium and /plans stuck on "Checking sign-in..."), so once auth.me has
  // settled we wait at most SDK_WAIT_MS for the SDK. If it later finds a
  // session, signedIn flips to true reactively.
  const [sdkWaitExpired, setSdkWaitExpired] = useState(false);
  useEffect(() => {
    if (meQuery.isLoading || !auth.isLoading) return;
    const timer = window.setTimeout(() => setSdkWaitExpired(true), SDK_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [meQuery.isLoading, auth.isLoading]);
  const isLoaded = Boolean(synthetic || serverUser) || (!meQuery.isLoading && (!auth.isLoading || sdkWaitExpired));
  const signingOut = useRef(false);

  const user: CompatUser = synthetic
    ? { id:String(synthetic.id), fullName:`Synthetic ${synthetic.role}`, imageUrl:null, primaryEmailAddress:{emailAddress:synthetic.email}, emailAddresses:[{emailAddress:synthetic.email,verification:{status:"verified"}}] }
    : auth.user
    ? {
        id: auth.user.id,
        fullName: [auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ") || null,
        imageUrl: auth.user.profilePictureUrl ?? null,
        primaryEmailAddress: { emailAddress: auth.user.email },
        emailAddresses: [{ emailAddress: auth.user.email, verification: { status: auth.user.emailVerified ? "verified" : "unverified" } }],
      }
    : serverUser
      ? {
          id: String(serverUser.id),
          fullName: serverUser.name || null,
          imageUrl: null,
          primaryEmailAddress: serverUser.email ? { emailAddress: serverUser.email } : null,
          emailAddresses: serverUser.email ? [{ emailAddress: serverUser.email, verification: { status: "verified" as const } }] : [],
        }
      : null;

  const openSignIn = useCallback((options?: { returnTo?: string }) => {
    if (!isLoaded || signedIn) return;
    const returnTo = safeAuthReturnTo(options?.returnTo ?? window.location.href, window.location.origin) ?? "/";
    window.location.href = `/api/auth/workos/sign-in?${new URLSearchParams({ returnTo })}`;
  }, [isLoaded, signedIn]);

  // Publish the SDK access token for non-React API clients (tRPC link).
  useEffect(() => {
    let cancelled = false;
    const publish = async () => {
      if (!auth.user) { setGlobalAccessToken(null); return; }
      try {
        const token = await auth.getAccessToken();
        if (!cancelled && !signingOut.current) {
          setGlobalAccessToken(token);
          if (token) await utils.auth.me.invalidate();
        }
      } catch { if (!cancelled) setGlobalAccessToken(null); }
    };
    void publish();
    return () => { cancelled = true; };
  }, [auth.user, auth.getAccessToken, utils]);

  // Clarity replay identity: internal person id only, never raw email.
  // No-op until Clarity init succeeds; nothing to reset on sign-out.
  useEffect(() => {
    identifyClarity(user?.id ?? null);
  }, [user?.id]);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    try {
      let response = await fetch("/api/auth/workos/logout", { method: "POST", credentials: "include" });
      if (response.status === 404) response = await fetch("/api/dev-auth/logout", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Sign out could not be completed. Please try again.");
    } catch (error) {
      signingOut.current = false;
      throw error;
    }
    try { await auth.signOut({ navigate: false }); } catch {}
    setGlobalAccessToken(null);
    try { sessionStorage.removeItem("manus-cookie"); } catch {}
    await utils.auth.me.cancel();
    utils.auth.me.setData(undefined, null);
    window.location.href = "/";
  }, [auth.signOut, utils]);

  // Every API call also carries the server cookie, so the bearer token is
  // optional. Never let a slow SDK refresh hold a click hostage (QA: Choose
  // Pro/Max took 25-35s): no SDK user -> no token; otherwise cap the wait.
  const getToken = useCallback(async () => {
    if (!auth.user) return null;
    try {
      return await Promise.race([auth.getAccessToken(), new Promise<null>(resolve => window.setTimeout(() => resolve(null), SDK_WAIT_MS))]);
    } catch { return null; }
  }, [auth.user, auth.getAccessToken]);

  const value = useMemo<CompatValue>(
    () => ({ isLoaded, isSignedIn: signedIn, userId: user?.id ?? null, getToken, signOut, user, openSignIn }),
    [isLoaded, signedIn, getToken, signOut, user, openSignIn],
  );

  return <CompatContext.Provider value={value}>{children}</CompatContext.Provider>;
}

function ServerSessionCompatProvider({ children }: { children: React.ReactNode }) {
  // No AuthKit client id (local dev / SDK-free mode): run the same compat
  // surface with a neutral SDK layer so consumers still get the server
  // cookie session via tRPC auth.me.
  const neutral = useMemo(() => ({
    isLoading: false,
    user: null,
    signIn: async () => { window.location.href = "/api/auth/workos/sign-in"; },
    getAccessToken: async () => null,
    signOut: async () => { /* handled by the compat signOut */ },
  }), []);
  return <CompatShell sdkAuth={neutral}>{children}</CompatShell>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID || "";
  if (!clientId) {
    // Misconfiguration should be loud in the console, not a blank page.
    console.error("[auth] VITE_WORKOS_CLIENT_ID is not set; falling back to server-session-only auth");
    return <ServerSessionCompatProvider>{children}</ServerSessionCompatProvider>;
  }
  return (
    <AuthKitErrorDowngrade>
      {(downgrade) => downgrade
        ? <ServerSessionCompatProvider>{children}</ServerSessionCompatProvider>
        : <WorkOSAuthKitProvider clientId={clientId} onRefresh={({ accessToken }) => setGlobalAccessToken(accessToken)}>
            <AuthKitInner>{children}</AuthKitInner>
          </WorkOSAuthKitProvider>}
    </AuthKitErrorDowngrade>
  );
}

class AuthKitErrorDowngrade extends React.Component<{ children: (downgrade: boolean) => React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    // false = use the live AuthKit SDK; true = AuthKit render failed, fall back
    // to the server-cookie-only compat layer instead of blanking the route.
    return this.props.children(Boolean(this.state.error));
  }
}

function AuthKitInner({ children }: { children: React.ReactNode }) {
  const auth = useWorkOSAuth();
  return <CompatShell sdkAuth={auth}>{children}</CompatShell>;
}

function useCompat(hookName: string): CompatValue {
  const value = useContext(CompatContext);
  if (!value) throw new Error(`${hookName} must be used within <AuthProvider> (WorkOS-backed)`);
  return value;
}

export function useAuth() {
  const compat = useCompat("useAuth");
  return { isLoaded: compat.isLoaded, isSignedIn: compat.isSignedIn, userId: compat.userId, getToken: compat.getToken, signOut: compat.signOut, openSignIn: compat.openSignIn };
}

export function useUser() {
  const compat = useCompat("useUser");
  return { isLoaded: compat.isLoaded, isSignedIn: compat.isSignedIn, user: compat.user };
}

export function SignInButton({ children, className }: { children?: React.ReactNode; className?: string }) {
  const compat = useCompat("SignInButton");
  // Many sign-in gates pass their own styled <button> as the child. Rendering
  // it inside our <button> would nest interactive elements (invalid HTML,
  // React DOM errors, unreliable clicks), so adopt a button child instead:
  // keep its styling/content and add the sign-in action to its own node.
  if (React.isValidElement(children) && children.type === "button") {
    const child = children as React.ReactElement<{ onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; className?: string }>;
    return React.cloneElement(child, {
      className: [child.props.className, className].filter(Boolean).join(" ") || undefined,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        child.props.onClick?.(event);
        if (!event.defaultPrevented) compat.openSignIn();
      },
    });
  }
  return <button type="button" className={className} onClick={() => compat.openSignIn()}>{children ?? "Sign in"}</button>;
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  return useCompat("SignedIn").isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  return useCompat("SignedOut").isSignedIn ? null : <>{children}</>;
}
