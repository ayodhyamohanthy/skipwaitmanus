// D-400 (owner, Nov 25 2026): who may administer skipwait.me.
//
// - The founder, ayodhya@skipwait.me, is the permanent super administrator. The address is fixed here, never read
//   from configuration, so no config change, handover or deploy can remove the founder's access.
// - SKIPWAIT_ADMIN_EMAIL names the delegable administrator seat (admin@skipwait.me today). Handing the seat to someone
//   else is a change to that one value.
//
// Every administrator check (the admin sign-in route, its callback and the role grant at sign-in) asks this module,
// so the two identities are defined once.

export const FOUNDER_SUPER_ADMIN_EMAIL = "ayodhya@skipwait.me";

const normalize = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

/** True only for the founder: the permanent super administrator. */
export function isFounderSuperAdmin(email: string | null | undefined): boolean {
  return normalize(email) === FOUNDER_SUPER_ADMIN_EMAIL;
}

/** The addresses that may sign in as administrator: the founder first, then the configured seat (if set and different). */
export function administratorEmails(configured: string | null | undefined = process.env.SKIPWAIT_ADMIN_EMAIL): readonly string[] {
  const seat = normalize(configured);
  return seat && seat !== FOUNDER_SUPER_ADMIN_EMAIL ? [FOUNDER_SUPER_ADMIN_EMAIL, seat] : [FOUNDER_SUPER_ADMIN_EMAIL];
}

/** True for the founder or the configured administrator seat. */
export function isAdministratorEmail(email: string | null | undefined, configured: string | null | undefined = process.env.SKIPWAIT_ADMIN_EMAIL): boolean {
  const value = normalize(email);
  return Boolean(value) && administratorEmails(configured).includes(value);
}
