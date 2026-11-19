/*
 * Names on public pages (P0-referrer-exposure, review round 1).
 *
 * No account carries a name its owner typed: work-email sign-ups stored the
 * part of the address before the @ until 2a900614, and the seeker email-code
 * and WorkOS fallbacks still do. Beside a verified company domain that part
 * rebuilds the work email, which every referrer surface promises never to
 * show. These pure rules decide at read time whether a stored name may appear
 * publicly; a name taken from the email comes back null, so the caller shows
 * its anonymous form. Nothing stored changes.
 */

/** The address's part before the first @, trimmed and lower-cased; null when there is none. */
function localPartOf(email: string | null | undefined): string | null {
  const local = typeof email === "string" ? (email.split("@")[0] ?? "").trim().toLowerCase() : "";
  return local || null;
}

/** What an address or a handle carries and a first name does not. */
const ADDRESS_SHAPED_WORD = /[@._+\d]/;

/**
 * The first name a person chose to show, or null when showing it is unsafe.
 * Only the first word, never the last name. Withheld when that word is the
 * account email's local part in any case ("Ravi" at acme.com rebuilds
 * ravi@acme.com) or carries @ . _ + or a digit (an address or handle, not a name).
 */
export function publicFirstNameOf(name: string | null | undefined, email: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || ADDRESS_SHAPED_WORD.test(first) || first.toLowerCase() === localPartOf(email)) return null;
  return first.slice(0, 80);
}

/**
 * The display name a public page may show, or null when it was taken from the
 * account's email: the whole local part in any case, anything with an @, or a
 * single address-shaped word (. _ + or a digit, no space). Any other name is
 * returned exactly as stored.
 */
export function publicDisplayNameOf(name: string | null | undefined, email: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  const oneAddressShapedWord = !/\s/.test(trimmed) && ADDRESS_SHAPED_WORD.test(trimmed);
  if (!trimmed || trimmed.includes("@") || oneAddressShapedWord || trimmed.toLowerCase() === localPartOf(email)) return null;
  return name;
}
