/**
 * A person's name as another user may see it. An account with no real display
 * name can carry its email (or the part before the @) as the name; showing that
 * would leak the address, so it reads as "no name".
 */
export function publicDisplayName(name: string | null | undefined, email: string | null | undefined): string | null {
  const shown = (name ?? "").trim();
  if (!shown || shown.includes("@")) return null;
  const local = (email ?? "").split("@")[0]?.trim().toLowerCase();
  if (local && shown.toLowerCase() === local) return null;
  return shown;
}
