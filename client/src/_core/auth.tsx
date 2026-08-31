import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AuthKitProvider as WorkOSAuthKitProvider, useAuth as useWorkOSAuth } from "@workos-inc/authkit-react";
import { setGlobalAccessToken } from "./accessToken";
import { trpc } from "@/lib/trpc";

/**
 * Clerk-compat provider backed by WorkOS AuthKit.
 *
 * ~20 call sites import useAuth/useUser/SignInButton/useClerk from
 * @clerk/react. Production auth is WorkOS AuthKit, so this module re-exposes
 * the Clerk-shaped hooks on top of the WorkOS context. The vite alias resolves
 * @clerk/react to THIS file when VITE_WORKOS_ENABLED=true.
 *
 * - useAuth()  -> { isLoaded, isSignedIn, userId, getToken, signOut }
 * - useUser()  -> { isLoaded, isSignedIn, user } (Clerk user shape)
 * - useClerk() -> { openSignIn, signOut } — openSignIn routes to AuthKit
 * - SignInButton navigates to AuthKit; UserButton renders a minimal avatar.
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
  openSignIn: () => void;
};

const CompatContext = createContext<CompatValue | null>(null);

function Inner({ children }: { children: React.ReactNode }) {
  const auth = useWorkOSAuth();
  // Server cookie session is the source of truth: it works for BOTH auth planes
  // (WorkOS AuthKit sign-in AND the referrer work-email OTP login). The AuthKit
  // SDK only knows its own PKCE session, so OTP users would look signed out.
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const utils = trpc.useUtils();

  const serverUser = meQuery.data ?? null;
  const signedIn = Boolean(serverUser) || Boolean(auth.user);
  const isLoaded = !meQuery.isLoading && !auth.isLoading;

  const user: CompatUser = auth.user
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

  const openSignIn = useCallback(() => {
    // AuthKit SDK PKCE when it can run (returns into the SPA); server 302 flow
    // otherwise. Both end at the same app_session_id cookie verified by tRPC.
    auth.signIn().catch(() => { window.location.href = "/api/auth/workos/sign-in"; });
  }, [auth.signIn]);

  // Publish the SDK access token for non-React API clients (tRPC link).
  useEffect(() => {
    let cancelled = false;
    const publish = async () => {
      if (!auth.user) { setGlobalAccessToken(null); return; }
      try {
        const token = await auth.getAccessToken();
        if (!cancelled) setGlobalAccessToken(token);
      } catch { if (!cancelled) setGlobalAccessToken(null); }
    };
    void publish();
    return () => { cancelled = true; };
  }, [auth.user, auth.getAccessToken]);

  const signOut = useCallback(async () => {
    try { await auth.signOut(); } catch { /* already signed out */ }
    try { await fetch("/api/auth/workos/logout", { method: "POST", credentials: "include" }); } catch { /* best effort */ }
    try { sessionStorage.removeItem("manus-cookie"); } catch {}
    await utils.auth.me.invalidate();
    utils.auth.me.setData(undefined, null);
    window.location.href = "/";
  }, [auth.signOut, utils]);

  const getToken = useCallback(async () => {
    try { return await auth.getAccessToken(); } catch { return null; }
  }, [auth.getAccessToken]);

  const value = useMemo<CompatValue>(
    () => ({ isLoaded, isSignedIn: signedIn, userId: user?.id ?? null, getToken, signOut, user, openSignIn }),
    [isLoaded, signedIn, getToken, signOut, user, openSignIn],
  );

  return <CompatContext.Provider value={value}>{children}</CompatContext.Provider>;
}

export function ClerkProvider({ children }: { children: React.ReactNode; publishableKey?: string }) {
  const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID || "";
  if (!clientId) {
    // Misconfiguration should be loud in the console, not a blank page.
    console.error("[auth] VITE_WORKOS_CLIENT_ID is not set; WorkOS-backed ClerkProvider cannot initialize AuthKit");
  }
  return (
    <WorkOSAuthKitProvider clientId={clientId}>
      <Inner>{children}</Inner>
    </WorkOSAuthKitProvider>
  );
}

function useCompat(hookName: string): CompatValue {
  const value = useContext(CompatContext);
  if (!value) throw new Error(`${hookName} must be used within <ClerkProvider> (WorkOS-backed)`);
  return value;
}

export function useAuth() {
  const compat = useCompat("useAuth");
  return { isLoaded: compat.isLoaded, isSignedIn: compat.isSignedIn, userId: compat.userId, getToken: compat.getToken, signOut: compat.signOut };
}

export function useUser() {
  const compat = useCompat("useUser");
  return { isLoaded: compat.isLoaded, isSignedIn: compat.isSignedIn, user: compat.user };
}

export function useClerk() {
  const compat = useCompat("useClerk");
  return { openSignIn: compat.openSignIn, signOut: compat.signOut };
}

export function SignInButton({ children, className }: { mode?: "modal" | "redirect"; children?: React.ReactNode; className?: string }) {
  const compat = useCompat("SignInButton");
  return <button type="button" className={className} onClick={compat.openSignIn}>{children ?? "Sign in"}</button>;
}

export function SignedIn({ children }: { children: React.ReactNode }) {
  return useCompat("SignedIn").isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: React.ReactNode }) {
  return useCompat("SignedOut").isSignedIn ? null : <>{children}</>;
}

export function UserButton() {
  const compat = useCompat("UserButton");
  if (!compat.isSignedIn) return null;
  return (
    <button type="button" aria-label="Account" onClick={() => { window.location.href = "/settings"; }} className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-600">
      {compat.user?.imageUrl ? <img src={compat.user.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-xs font-bold">{compat.user?.fullName?.[0] ?? "U"}</span>}
    </button>
  );
}
