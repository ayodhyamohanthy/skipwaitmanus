// Goal /settings (D-048-p3-settings; packet docs/plans/D-048-account.md).
// Section order and every confirm step stay exactly as the kit page has them;
// only the visual language and the next-step block change. Region and App work
// signed out; the other three ask for the shared sign-in first.
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalNextStep, useOnlineStatus } from "@/components/goal";
import { SETTINGS_SECTIONS, parseSettingsSection, type SettingsSection } from "@/components/settings/SettingsNav";
import { usePersistFn } from "@/hooks/usePersistFn";
import { Link, useLocation, useSearch } from "wouter";
import AccountSection from "./AccountSection";
import AppSection from "./AppSection";
import NotificationsSection from "./NotificationsSection";
import PrivacySection from "./PrivacySection";
import RegionSection from "./RegionSection";

export const GOAL_PAGE = { goalLine: "Control your account." } as const;

const LABELS: Record<SettingsSection, string> = {
  region: "Region",
  notifications: "Notifications",
  app: "App",
  privacy: "Privacy",
  account: "Account",
};

const SIGNED_OUT: Record<"notifications" | "privacy" | "account", string> = {
  notifications: "Sign in to see how skipwait.me reaches you.",
  privacy: "Sign in to manage blocked people, talent discovery consent, assistants and your data.",
  account: "Sign in to manage your work email and account.",
};

const isAccountSection = (section: SettingsSection): section is keyof typeof SIGNED_OUT =>
  section === "notifications" || section === "privacy" || section === "account";

function OfflineNotice() {
  return (
    <p data-testid="goal-offline-state" role="status" className="mt-4 flex items-center gap-2 text-g-meta text-g-ink-2">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-g-ink" />
      You're offline. Changes can't be saved until you reconnect.
    </p>
  );
}

function SignedOutSection({ section, returnTo }: { section: keyof typeof SIGNED_OUT; returnTo: string }) {
  return (
    <GoalNextStep reason={SIGNED_OUT[section]}>
      <GoalButton className="mt-4" variant="primary" touch="large" asChild>
        <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>
      </GoalButton>
    </GoalNextStep>
  );
}

export default function GoalSettings() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [path, navigate] = useLocation();
  const search = useSearch();
  const section = parseSettingsSection(search);
  // wouter's useSearch() has no leading "?" in some versions; keep the return target exact either way.
  const returnTo = `${path}${search && !search.startsWith("?") ? `?${search}` : search}`;
  const select = (next: SettingsSection) => navigate(`${path}?section=${next}`, { replace: true });

  const body = () => {
    if (isAccountSection(section) && !isLoaded) return <p role="status" className="mt-4 text-g-meta text-g-ink-2">Checking your sign-in…</p>;
    if (isAccountSection(section) && !isSignedIn) return <SignedOutSection section={section} returnTo={returnTo} />;
    switch (section) {
      case "region": return <RegionSection />;
      case "app": return <AppSection />;
      case "notifications": return <NotificationsSection getToken={fetchToken} online={online} />;
      case "privacy": return <PrivacySection getToken={fetchToken} online={online} />;
      case "account": return <AccountSection getToken={fetchToken} online={online} />;
    }
  };

  return (
    <main data-skipwait-screen="settings" data-goal-page="settings" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <header className="max-w-[720px]">
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-3 max-w-[620px] text-g-body text-g-ink-2">Choose your region and how we reach you, then control what we keep.</p>
      </header>
      {!online ? <OfflineNotice /> : null}
      <nav aria-label="Settings sections" className="mt-6 flex gap-1 overflow-x-auto border-b border-g-hairline">
        {SETTINGS_SECTIONS.map(item => (
          <button
            key={item}
            type="button"
            aria-current={item === section ? "page" : undefined}
            onClick={() => select(item)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 text-g-label transition-colors ${item === section ? "border-g-ink font-semibold text-g-ink" : "border-transparent text-g-ink-2 hover:text-g-ink"}`}
          >{LABELS[item]}</button>
        ))}
      </nav>
      <div className="mt-6 max-w-[760px]">{body()}</div>
    </main>
  );
}
