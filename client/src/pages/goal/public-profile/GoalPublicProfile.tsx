// Goal /p/:handle (D-048-p3-public-profile; packet docs/plans/D-048-marketing.md).
// Same read as the kit page (GET /api/p/:handle) and the same owner write (the
// partial PUT /api/profile/me), but the visibility rules are stated honestly:
// a private page says only that it is private, an unknown handle is not called
// private, and a failed read says so and retries. The owner keeps the page's
// one control - who can see it - and can preview exactly what a visitor gets.
import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalNextStep, useOnlineStatus } from "@/components/goal";
import { asProfileVisibility, type ProfileVisibility } from "@/components/profile/profileVisibility";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { LoadError, LoadingState, NETWORK_ERROR, OfflineNotice } from "@/pages/goal/profile/profileParts";
import { PublicProfileFrame } from "./PublicProfileFrame";
import { ProfileFooter, ProfileIdentity, ViewAsToggle, VisibilityPanel, WorkList, type PublicProfileData } from "./publicProfileParts";

/** "See Asha R.'s work." - the page's h1 once the name is known. */
export const goalLineFor = (name: string) => `See ${name}'s work.`;

/** Declared line when no name is known (loading) or the server sends none. */
export const GOAL_PAGE = { goalLine: goalLineFor("this person") } as const;

type LoadState =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfileData }
  | { status: "missing" }
  | { status: "error"; message: string };

const LOAD_FAILED = "We couldn't load this profile.";
const SAVE_FAILED = "We couldn't update who can see this page.";

export default function GoalPublicProfile() {
  const [, params] = useRoute("/p/:handle");
  const handle = params?.handle ?? "";
  const { getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [viewAs, setViewAs] = useState<"you" | "visitor">("you");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");

  const load = useCallback(async () => {
    if (!handle) { setState({ status: "missing" }); return; }
    setState({ status: "loading" });
    let response: Response;
    try {
      response = await fetch(`/api/p/${encodeURIComponent(handle)}`, { credentials: "include" });
    } catch { setState({ status: "error", message: NETWORK_ERROR }); return; }
    // An unknown handle is its own state: never shown as "private".
    if (response.status === 404) { setState({ status: "missing" }); return; }
    try {
      const payload = await readApiJson<{ profile?: PublicProfileData; error?: string }>(response, LOAD_FAILED);
      if (!response.ok || !payload.profile) throw new Error(payload.error || LOAD_FAILED);
      setState({ status: "ready", profile: payload.profile });
    } catch (reason) {
      setState({ status: "error", message: reason instanceof Error && reason.message ? reason.message : LOAD_FAILED });
    }
  }, [handle]);

  useEffect(() => { void load(); }, [load]);

  const profile = state.status === "ready" ? state.profile : null;
  const ownsPage = profile?.visible === true && profile.isOwner === true;
  const asOwner = ownsPage && viewAs === "you";
  const gated = state.status === "missing" || (profile !== null && !profile.visible) || (ownsPage && !asOwner && profile.visibility === "private");

  useEffect(() => {
    if (!profile?.visible || profile.visibility !== "link") return undefined;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, [profile?.visible, profile?.visibility]);

  const publicUrl = `https://skipwait.me/p/${profile?.handle ?? handle}`;
  const copyLink = () => {
    void navigator.clipboard?.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const share = () => {
    if (typeof navigator.share === "function") {
      void navigator.share({ title: `${profile?.displayName ?? "skipwait.me"} on skipwait.me`, url: publicUrl }).catch(() => undefined);
      return;
    }
    copyLink();
  };

  const saveVisibility = async (next: ProfileVisibility) => {
    if (!profile?.isOwner || saving || !online) return;
    setSaving(true); setVisibilityError("");
    try {
      const token = await fetchToken();
      let response: Response;
      try {
        response = await fetch("/api/profile/me", {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ profileVisibility: next }),
        });
      } catch { throw new Error(NETWORK_ERROR); }
      const payload = await readApiJson<{ error?: string }>(response, SAVE_FAILED);
      if (!response.ok) throw new Error(payload.error || SAVE_FAILED);
      await load();
    } catch (reason) {
      setVisibilityError(reason instanceof Error && reason.message ? reason.message : SAVE_FAILED);
    } finally { setSaving(false); }
  };

  const toggle = ownsPage ? <ViewAsToggle value={viewAs} onChange={setViewAs} /> : null;
  const trusted = profile?.verifiedWork ? profile.company || profile.verifiedWork.domain : null;

  if (state.status === "loading") {
    return (
      <PublicProfileFrame screen="public-profile-loading">
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <LoadingState label="Loading this profile…" />
      </PublicProfileFrame>
    );
  }

  if (gated) {
    if (state.status === "missing") {
      return (
        <PublicProfileFrame screen="public-profile-missing">
          <h1 className="text-balance text-g-display text-g-ink">This profile isn&apos;t available.</h1>
          <p className="mt-3 max-w-[620px] text-g-body text-g-ink-2">The link may be wrong, or this person changed their profile link.</p>
          <div className="mt-6 max-w-[620px]">
            <GoalNextStep reason="Find a company you want a referral at and start from there.">
              <div className="mt-4"><GoalButton variant="primary" touch="large" asChild><Link href="/explore">Explore companies</Link></GoalButton></div>
            </GoalNextStep>
          </div>
          <ProfileFooter />
        </PublicProfileFrame>
      );
    }
    return (
      <PublicProfileFrame screen="public-profile-private" right={toggle}>
        <h1 className="text-balance text-g-display text-g-ink">This profile is private.</h1>
        <p className="mt-3 max-w-[620px] text-g-body text-g-ink-2">Only this person can see this page.</p>
        <div className="mt-6 max-w-[620px]">
          <GoalNextStep reason="You can still find a company you want a referral at and send one referral request.">
            <div className="mt-4"><GoalButton variant="primary" touch="large" asChild><Link href="/explore">Explore companies</Link></GoalButton></div>
          </GoalNextStep>
        </div>
        <ProfileFooter />
      </PublicProfileFrame>
    );
  }

  if (state.status === "error") {
    return (
      <PublicProfileFrame screen="public-profile-error">
        <h1 className="text-balance text-g-display text-g-ink">This profile didn&apos;t load.</h1>
        <div className="max-w-[620px]"><LoadError message={state.message} onRetry={() => { void load(); }} /></div>
      </PublicProfileFrame>
    );
  }

  const shown = state.profile;
  const name = shown.displayName?.trim() ?? "";
  const line = name ? goalLineFor(name) : GOAL_PAGE.goalLine;
  const allItems = shown.workItems ?? [];
  const items = asOwner ? allItems : allItems.filter(item => item.visibleOnProfile);

  return (
    <PublicProfileFrame screen="public-profile" right={toggle}>
      {!online ? <OfflineNotice /> : null}
      <h1 className="text-balance text-g-display text-g-ink">{line}</h1>
      <ProfileIdentity profile={shown} />

      {asOwner ? (
        <VisibilityPanel current={asProfileVisibility(shown.visibility)} saving={saving} offline={!online} error={visibilityError}
          path={`skipwait.me/p/${shown.handle ?? handle}`} onSelect={next => { void saveVisibility(next); }} />
      ) : null}

      <WorkList items={items} isOwner={asOwner} />

      {asOwner ? (
        <div className="mt-8 max-w-[620px]">
          <GoalNextStep reason="Share this page with people you trust. You choose who can see it, and you can change that here.">
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <GoalButton variant="primary" touch="large" onClick={copyLink}>{copied ? "Link copied" : "Copy your link"}</GoalButton>
              {typeof navigator.share === "function" ? <GoalButton variant="outline" touch="large" onClick={share}>Share…</GoalButton> : null}
            </div>
            <p role="status" className="sr-only">{copied ? "Your profile link is copied." : ""}</p>
          </GoalNextStep>
        </div>
      ) : (
        <div className="mt-8 max-w-[620px]">
          <GoalNextStep reason={trusted ? `Find a role at ${trusted} and send a referral request to a verified employee.` : "Find a role worth a referral and send one referral request to a verified employee."}>
            <div className="mt-4"><GoalButton variant="primary" touch="large" asChild><Link href="/explore">Explore companies</Link></GoalButton></div>
          </GoalNextStep>
        </div>
      )}

      <ProfileFooter />
    </PublicProfileFrame>
  );
}
