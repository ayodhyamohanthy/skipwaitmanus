import { DEFAULT_SEEKER_SETUP, GOAL_NAMES, LEVELS, LINK_KINDS, MAX_ROLES, ROLES, VISA_OPTIONS, CITY_MAX, COUNTRIES_MAX, seekerSetupPatchSchema, type SeekerSetup } from "@shared/seekerSetup";

/**
 * Seeker setup answers for /onboarding. They live on the account (server
 * GET/PATCH /api/profile/setup); the shapes are shared with the server so both
 * sides validate the same way. Signed-out visitors keep answers in memory only.
 */
export { CITY_MAX, COUNTRIES_MAX, GOAL_NAMES, LEVELS, LINK_KINDS, MAX_ROLES, ROLES, VISA_OPTIONS };

export const STEPS = ["Goal", "Roles", "Resume", "Work", "Location", "Ready"] as const;
export const READY_STEP = STEPS.length - 1;

export type Goal = (typeof GOAL_NAMES)[number];
export const GOAL_HINTS: Readonly<Record<Goal, string>> = {
  "Actively looking": "Interviewing or applying this month",
  "Open to the right role": "Happy where I am, curious",
  "Changing careers": "Moving into a new function",
  "Just graduated": "Looking for a first role",
};
export type LinkKind = (typeof LINK_KINDS)[number];
export type OnboardingState = SeekerSetup;

export function emptyOnboarding(): OnboardingState {
  return { ...DEFAULT_SEEKER_SETUP, roles: [], links: [] };
}

/** The PATCH body for the current answers. */
export function toSetupPatch(state: OnboardingState) {
  return seekerSetupPatchSchema.parse({
    goal: state.goal, roles: state.roles, level: state.level, links: state.links, city: state.city.trim(),
    countries: state.countries.trim(), remote: state.remote, visa: state.visa, resumeAttachmentId: state.resume?.id ?? null,
  });
}

export type ReadinessItem = { readonly label: string; readonly done: boolean; readonly step: number };

/** The ready-step checklist. Completion is computed from these same items. */
export function readiness(state: OnboardingState): readonly ReadinessItem[] {
  return [
    { label: "Search goal", done: true, step: 0 },
    { label: "Target roles", done: state.roles.length > 0, step: 1 },
    { label: "Resume", done: state.resume !== null, step: 2 },
    { label: "Work links", done: state.links.length > 0, step: 3 },
    { label: "Location & authorization", done: state.city.trim() !== "" || state.countries.trim() !== "", step: 4 },
  ];
}

export function completionPercent(items: readonly ReadinessItem[]): number {
  return Math.round((items.filter(item => item.done).length / items.length) * 100);
}
