import { z } from "zod";

/**
 * Seeker setup answers (/onboarding). Shared by the client form and the
 * server route so both sides validate the same shape. Free text is bounded;
 * enums are closed lists. Nothing here is parsed into a location yet.
 */
export const GOAL_NAMES = ["Actively looking", "Open to the right role", "Changing careers", "Just graduated"] as const;
export const ROLES = ["Software Engineer", "Product Manager", "Product Designer", "Data Analyst", "Data Scientist", "Marketing", "Operations", "Sales", "Customer Success", "Consulting"] as const;
export const MAX_ROLES = 3;
export const LEVELS = ["Student / intern", "Early career", "Mid-level", "Senior", "Lead / manager", "Director+"] as const;
export const LINK_KINDS = ["LinkedIn", "GitHub", "Portfolio site", "Behance / Dribbble"] as const;
export const VISA_OPTIONS = ["No sponsorship needed", "Need sponsorship for some countries", "Open to relocation with sponsorship"] as const;
export const CITY_MAX = 120;
export const COUNTRIES_MAX = 240;

const unique = <T>(items: readonly T[]): T[] => items.filter((item, index) => items.indexOf(item) === index);

/** PATCH body: every field optional; an omitted field is left unchanged. */
export const seekerSetupPatchSchema = z.object({
  goal: z.enum(GOAL_NAMES).optional(),
  roles: z.array(z.enum(ROLES)).max(MAX_ROLES * 3).transform(roles => unique(roles)).refine(roles => roles.length <= MAX_ROLES, `Pick up to ${MAX_ROLES} roles`).optional(),
  level: z.union([z.enum(LEVELS), z.literal("")]).optional(),
  links: z.array(z.enum(LINK_KINDS)).transform(unique).optional(),
  city: z.string().trim().max(CITY_MAX).optional(),
  countries: z.string().trim().max(COUNTRIES_MAX).optional(),
  remote: z.boolean().optional(),
  visa: z.enum(VISA_OPTIONS).optional(),
  /** referralAttachments.id of an upload the caller owns, or null to clear. */
  resumeAttachmentId: z.number().int().positive().nullable().optional(),
}).strict();

export type SeekerSetupPatch = z.output<typeof seekerSetupPatchSchema>;

export type SeekerSetup = {
  goal: (typeof GOAL_NAMES)[number];
  roles: Array<(typeof ROLES)[number]>;
  level: (typeof LEVELS)[number] | "";
  links: Array<(typeof LINK_KINDS)[number]>;
  city: string;
  countries: string;
  remote: boolean;
  visa: (typeof VISA_OPTIONS)[number];
  resume: { id: number; fileName: string } | null;
};

export const DEFAULT_SEEKER_SETUP: SeekerSetup = {
  goal: "Actively looking",
  roles: [],
  level: "",
  links: [],
  city: "",
  countries: "",
  remote: true,
  visa: "Need sponsorship for some countries",
  resume: null,
};
