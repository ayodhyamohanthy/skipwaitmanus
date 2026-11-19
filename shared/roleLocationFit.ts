import type { SeekerSetup } from "./seekerSetup";

/**
 * Role location fit for the /ask composer. Advisory only: a mismatch warns,
 * it never blocks sending and is not sent to the server.
 */
export type LocationProfile = Pick<SeekerSetup, "city" | "countries" | "remote" | "visa">;
export type RoleLocation = { readonly kind: "remote" | "hybrid" | "onsite"; readonly place: string };
export type LocationFit = "fits" | "needs_sponsorship" | "mismatch" | "unknown";
export type RoleLocationOption = { readonly value: string; readonly label: string };

export const OTHER_LOCATION = "other";

const norm = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const parts = (text: string) => text.split(/[,;/]/).map(norm).filter(Boolean);
const firstPart = (text: string) => text.split(",")[0]?.trim() ?? "";

/** Options derived only from what the seeker saved, plus "Other location…". */
export function roleLocationOptions(profile: LocationProfile | null): RoleLocationOption[] {
  const options: RoleLocationOption[] = [];
  const country = profile ? firstPart(profile.countries.split(/[;/]/)[0] ?? "") : "";
  if (profile && country && profile.remote) options.push({ value: `remote:${country}`, label: `Remote · ${country}` });
  if (profile?.city.trim()) options.push({ value: `hybrid:${firstPart(profile.city)}`, label: `Hybrid · ${firstPart(profile.city)}` });
  options.push({ value: OTHER_LOCATION, label: "Other location…" });
  return options;
}

export function parseRoleLocation(value: string, otherPlace: string): RoleLocation | null {
  if (value === OTHER_LOCATION) { const place = otherPlace.trim().slice(0, 80); return place ? { kind: "onsite", place } : null; }
  const [kind, ...rest] = value.split(":");
  const place = rest.join(":").trim();
  return (kind === "remote" || kind === "hybrid") && place ? { kind, place } : null;
}

export function roleLocationFit(role: RoleLocation | null, profile: LocationProfile | null): LocationFit {
  if (!role || !profile) return "unknown";
  const known = [...parts(profile.city), ...parts(profile.countries)];
  const place = norm(role.place);
  const placeMatches = known.some(item => item === place || place.includes(item) || item.includes(place));
  if (role.kind === "remote") {
    if (!profile.remote) return "mismatch";
    if (known.length === 0 || placeMatches) return "fits";
    return profile.visa === "No sponsorship needed" ? "mismatch" : "needs_sponsorship";
  }
  if (known.length === 0) return "unknown";
  if (placeMatches) return "fits";
  return profile.visa === "No sponsorship needed" ? "mismatch" : "needs_sponsorship";
}

export function locationFitMessage(fit: LocationFit, role: RoleLocation | null): string | null {
  if (!role) return null;
  if (fit === "needs_sponsorship") return `This role is in ${role.place} and may need work authorization or relocation. You said you need sponsorship for some countries.`;
  if (fit === "mismatch") return role.kind === "remote" ? "This role is remote, and your setup says you prefer in-person roles." : `This role is in ${role.place}, outside the places you listed.`;
  return null;
}
