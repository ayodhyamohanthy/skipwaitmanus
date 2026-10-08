import { z } from "zod";

/**
 * Seeker setup answers for /onboarding. There is no server profile for these
 * fields yet, so they live on this device only (the page says so). Storage is
 * an untrusted boundary: every read is parsed field by field, and anything
 * unknown or malformed falls back to an honest empty default.
 */
export const ONBOARDING_STORAGE_KEY = "skipwait-onboarding-v1";

export const STEPS = ["Goal", "Roles", "Resume", "Work", "Location", "Ready"] as const;
export const READY_STEP = STEPS.length - 1;

export const GOAL_NAMES = ["Actively looking", "Open to the right role", "Changing careers", "Just graduated"] as const;
export type Goal = (typeof GOAL_NAMES)[number];
export const GOAL_HINTS: Readonly<Record<Goal, string>> = {
  "Actively looking": "Interviewing or applying this month",
  "Open to the right role": "Happy where I am, curious",
  "Changing careers": "Moving into a new function",
  "Just graduated": "Looking for a first role",
};

export const ROLES = ["Software Engineer", "Product Manager", "Product Designer", "Data Analyst", "Data Scientist", "Marketing", "Operations", "Sales", "Customer Success", "Consulting"] as const;
export const MAX_ROLES = 3;
export const LEVELS = ["Student / intern", "Early career", "Mid-level", "Senior", "Lead / manager", "Director+"] as const;
export const LINK_KINDS = ["LinkedIn", "GitHub", "Portfolio site", "Behance / Dribbble"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const VISA_OPTIONS = ["No sponsorship needed", "Need sponsorship for some countries", "Open to relocation with sponsorship"] as const;
export const CITY_MAX = 120;
export const COUNTRIES_MAX = 240;

const unique = <T>(items: readonly T[]): T[] => items.filter((item, index) => items.indexOf(item) === index);

export const onboardingSchema = z.object({
  goal: z.enum(GOAL_NAMES).catch("Actively looking"),
  roles: z.array(z.enum(ROLES)).catch([]).transform(roles => unique(roles).slice(0, MAX_ROLES)),
  level: z.union([z.enum(LEVELS), z.literal("")]).catch(""),
  links: z.array(z.enum(LINK_KINDS)).catch([]).transform(unique),
  city: z.string().max(CITY_MAX).catch(""),
  countries: z.string().max(COUNTRIES_MAX).catch(""),
  remote: z.boolean().catch(true),
  visa: z.enum(VISA_OPTIONS).catch("Need sponsorship for some countries"),
  resume: z.object({ id: z.number().int().positive(), fileName: z.string().min(1).max(255) }).nullable().catch(null),
});

export type OnboardingState = z.output<typeof onboardingSchema>;

export function emptyOnboarding(): OnboardingState {
  return onboardingSchema.parse({});
}

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return emptyOnboarding();
    const parsed: unknown = JSON.parse(raw);
    const result = onboardingSchema.safeParse(parsed);
    return result.success ? result.data : emptyOnboarding();
  } catch {
    return emptyOnboarding();
  }
}

export function saveOnboarding(state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or blocked storage: answers stay in memory for this visit */
  }
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
