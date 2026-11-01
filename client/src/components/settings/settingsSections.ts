// Shared settings section constants and parsing (D-048-p3-settings / D-048-p3-discovery).
// Behavior-only: no UI, no styling, no kit imports. Used by both kit SettingsNav and goal GoalSettings.

export const SETTINGS_SECTIONS = ["region", "notifications", "app", "privacy", "account"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Reads ?section= from a search string; anything unknown falls back to Region. */
export function parseSettingsSection(search: string): SettingsSection {
  const value = new URLSearchParams(search).get("section");
  return SETTINGS_SECTIONS.find(section => section === value) ?? "region";
}