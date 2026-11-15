// Kit v4 /settings (app/src/routes/settings.tsx): Heading, a 200px section nav
// (a pill row on mobile) and one column of Panels per section. The section
// lives in the URL (?section=region|notifications|app|privacy|account).
// Region and App work signed out; account sections ask to sign in first.
import { useLocation, useSearch } from "wouter";
import { lazy, Suspense } from "react";
import { useAuth } from "@/_core/auth";
import { Heading } from "@/components/kit/preview-kit";
import { usePersistFn } from "@/hooks/usePersistFn";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { AccountPanels } from "@/components/settings/AccountPanels";
import { AppPanel } from "@/components/settings/AppPanel";
import { NotificationPanels } from "@/components/settings/NotificationPanels";
import { PrivacyPanels } from "@/components/settings/PrivacyPanels";
import { RegionPanel } from "@/components/settings/RegionPanel";
import { SettingsNav, parseSettingsSection, type SettingsSection } from "@/components/settings/SettingsNav";
import { Loading, SignInPanel } from "@/components/settings/settingsUi";

const GoalSettings = lazy(() => import("./goal/settings/GoalSettings"));

const SIGNED_OUT: Record<"notifications" | "privacy" | "account", { title: string; text: string }> = {
  notifications: { title: "Notifications", text: "Sign in to see how skipwait.me reaches you." },
  privacy: { title: "Privacy", text: "Sign in to manage blocked people, talent discovery consent, assistants and your data." },
  account: { title: "Account", text: "Sign in to manage your work email and account." },
};

export default function Settings() {
  if (goalSurfaceOn("settings")) return <Suspense fallback={null}><GoalSettings /></Suspense>;
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [path, navigate] = useLocation();
  const section = parseSettingsSection(useSearch());
  const select = (next: SettingsSection) => navigate(`${path}?section=${next}`, { replace: true });

  const panels = () => {
    if (!isLoaded && section !== "region" && section !== "app") return <Loading>Checking your sign-in…</Loading>;
    switch (section) {
      case "region": return <RegionPanel />;
      case "app": return <AppPanel />;
      case "notifications": return isSignedIn ? <NotificationPanels getToken={fetchToken} /> : <SignInPanel {...SIGNED_OUT.notifications} />;
      case "privacy": return isSignedIn ? <PrivacyPanels getToken={fetchToken} /> : <SignInPanel {...SIGNED_OUT.privacy} />;
      case "account": return isSignedIn ? <AccountPanels getToken={fetchToken} /> : <SignInPanel {...SIGNED_OUT.account} />;
    }
  };

  return <main data-skipwait-screen="settings" className="page-content">
    <Heading eyebrow="ACCOUNT" title="Settings" />
    <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
      <SettingsNav active={section} onSelect={select} />
      <div className="min-w-0 space-y-4">{panels()}</div>
    </div>
  </main>;
}
