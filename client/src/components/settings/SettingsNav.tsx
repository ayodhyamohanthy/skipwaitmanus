// Kit v4 Settings section nav (app/src/routes/settings.tsx): a 200px column of
// min-h-11 rounded-xl buttons on desktop, a horizontal pill row on mobile.
export const SETTINGS_SECTIONS = ["region", "notifications", "app", "privacy", "account"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const LABELS: Record<SettingsSection, string> = {
  region: "Region",
  notifications: "Notifications",
  app: "App",
  privacy: "Privacy",
  account: "Account",
};

/** Reads ?section= from a search string; anything unknown falls back to Region. */
export function parseSettingsSection(search: string): SettingsSection {
  const value = new URLSearchParams(search).get("section");
  return SETTINGS_SECTIONS.find(section => section === value) ?? "region";
}

export function SettingsNav({ active, onSelect }: { active: SettingsSection; onSelect: (section: SettingsSection) => void }) {
  return <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Settings sections">
    {SETTINGS_SECTIONS.map(section => <button
      key={section}
      type="button"
      aria-current={active === section ? "page" : undefined}
      onClick={() => onSelect(section)}
      className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm ${active === section ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted"}`}
    >{LABELS[section]}</button>)}
  </nav>;
}
