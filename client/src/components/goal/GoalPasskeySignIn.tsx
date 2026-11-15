/**
 * DEVICE-SIGNIN-passkeys (owner, Oct 26): the browser's own saved-credential
 * experience for returning seekers, on the goal sign-in only (owner: never the
 * old screens). The prompt itself is owned and drawn by the browser - we do
 * not fake or restyle it. Two surfaces:
 *
 * - PasskeySignInButton: "Use a saved passkey" opens the browser's saved-account
 *   sheet, and conditional UI offers saved passkeys in the email field's
 *   autofill (Chrome, Safari, Firefox, Edge - passkeys.dev device matrix).
 * - PasskeyEnrollmentOffer: after a successful email-code sign-in, asks once
 *   whether to save this device as a passkey for next time.
 *
 * Both talk to /api/auth/passkey/* (server: server/_core/passkeyLogin.ts,
 * flag-gated off until QA, D-097). Referrers never see this component.
 */
import { startAuthentication, startRegistration, browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { GoalButton } from "@/components/goal/GoalButton";
import { useEffect, useState } from "react";

type PasskeyApiResponse = {
  challenge?: string;
  error?: string;
  signedIn?: boolean;
  registered?: boolean;
  ceremonyId?: number | string;
  [key: string]: unknown;
};

async function postJSON(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: PasskeyApiResponse | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  let data: PasskeyApiResponse | null = null;
  try {
    data = (await res.json()) as PasskeyApiResponse;
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, data };
}

async function authenticateWithPasskey(returnTo: string): Promise<{ signedIn: boolean; error?: string }> {
  const optionsRes = await postJSON("/api/auth/passkey/login/options", {});
  if (!optionsRes.ok || !optionsRes.data) return { signedIn: false, error: optionsRes.data?.error ?? "Passkey sign-in is not available right now." };
  const ceremonyId = optionsRes.data.ceremonyId;
  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: optionsRes.data as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
  } catch {
    return { signedIn: false }; // person dismissed the browser prompt - not an error
  }
  const verifyRes = await postJSON("/api/auth/passkey/login/verify", { ...assertion, ceremonyId });
  if (!verifyRes.ok || !verifyRes.data?.signedIn) return { signedIn: false, error: verifyRes.data?.error ?? "That sign-in could not be verified. Try again." };
  window.location.assign(returnTo);
  return { signedIn: true };
}

/** Headless conditional-UI listener: mount on the stage whose email input
 *  carries autocomplete="username webauthn". Saved passkeys appear in that
 *  field's autofill; choosing one signs in. Renders nothing. */
export function PasskeyAutofill({ returnTo }: { returnTo: string }) {
  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    let cancelled = false;
    (async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) return;
        const optionsRes = await postJSON("/api/auth/passkey/login/options", {});
        if (!optionsRes.ok || !optionsRes.data || cancelled) return;
        const ceremonyId = optionsRes.data.ceremonyId;
        const assertion = await startAuthentication({ optionsJSON: optionsRes.data as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"], useBrowserAutofill: true });
        if (cancelled) return;
        const verifyRes = await postJSON("/api/auth/passkey/login/verify", { ...assertion, ceremonyId });
        if (!cancelled && verifyRes.ok && verifyRes.data?.signedIn) window.location.assign(returnTo);
      } catch { /* conditional prompt dismissed or unavailable */ }
    })();
    return () => { cancelled = true; };
  }, [returnTo]);
  return null;
}

export function PasskeySignInButton({ returnTo }: { returnTo: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!browserSupportsWebAuthn()) return null;
  return (
    <div>
      <GoalButton
        type="button"
        variant="outline"
        className="w-full rounded-full!"
        leadingIcon={KeyRound}
        busy={busy}
        busyLabel="Waiting for your device…"
        onClick={async () => {
          setBusy(true); setError("");
          const result = await authenticateWithPasskey(returnTo);
          if (!result.signedIn && result.error) setError(result.error);
          setBusy(false);
        }}
      >Use a saved passkey</GoalButton>
      {error && <p role="alert" className="mt-2 text-[13px] leading-[1.5] text-g-ink-3">{error}</p>}
    </div>
  );
}

export function PasskeyEnrollmentOffer({ email, returnTo }: { email: string; returnTo: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (!browserSupportsWebAuthn()) { setSupported(false); return; }
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(setSupported).catch(() => setSupported(false));
  }, []);

  useEffect(() => {
    if (supported === false) {
      window.location.assign(returnTo);
    }
  }, [supported, returnTo]);

  if (supported !== true) {
    return null;
  }

  const finish = () => {
    try {
      localStorage.setItem("skipwait_passkey_dismissed_" + email.toLowerCase(), "true");
    } catch { /* storage restricted */ }
    window.location.assign(returnTo);
  };

  return (
    <div className="rounded-[10px] border border-g-hairline p-4">
      <p className="text-g-small font-semibold text-g-ink">Save this device for faster sign-in?</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-g-ink-3">Next time, {email} can sign in with this device's fingerprint, face or screen lock - no code needed.</p>
      <div className="mt-3 flex gap-2">
        <GoalButton
          type="button"
          variant="primary"
          className="flex-1 rounded-full!"
          busy={busy}
          busyLabel="Waiting for your device…"
          onClick={async () => {
            setBusy(true); setError("");
            const optionsRes = await postJSON("/api/auth/passkey/register/options", {});
            if (!optionsRes.ok || !optionsRes.data) {
              setError(optionsRes.data?.error ?? "Passkey setup is not available right now.");
              setBusy(false);
              return;
            }
            try {
              const attestation = await startRegistration({ optionsJSON: optionsRes.data as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
              const verifyRes = await postJSON("/api/auth/passkey/register/verify", attestation);
              if (!verifyRes.ok) {
                setError(verifyRes.data?.error ?? "That passkey could not be saved. You can try again later.");
              } else {
                try {
                  localStorage.setItem("skipwait_passkey_enrolled_" + email.toLowerCase(), "true");
                } catch { /* storage restricted */ }
                window.location.assign(returnTo);
              }
            } catch {
              setError("Passkey setup was dismissed. You can add it later.");
              try {
                localStorage.setItem("skipwait_passkey_dismissed_" + email.toLowerCase(), "true");
              } catch { /* storage restricted */ }
            }
            setBusy(false);
          }}
        >Save passkey</GoalButton>
        <GoalButton type="button" variant="ghost" onClick={finish}>Not now</GoalButton>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] leading-[1.5] text-g-ink-3">{error}</p>}
    </div>
  );
}
