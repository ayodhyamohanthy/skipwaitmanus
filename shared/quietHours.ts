/**
 * Quiet hours: a window during which a person does not want to be notified.
 *
 * CHECKLIST.md, Completion flows: "quiet hours in user time zone". The whole
 * difficulty is in that phrase -- "22:00 to 07:00" is not a comparison of two
 * clock readings, it is a window that WRAPS past midnight, and it has to be
 * evaluated in the recipient's zone rather than the server's.
 *
 * WHY A SHARED MODULE: the client has to render the same window it stored, and
 * the server has to decide whether to send. Two implementations of "is it quiet
 * now" would eventually disagree, and the failure is invisible -- a notification
 * simply arrives at the wrong hour, which nobody reports as a bug.
 *
 * THE THREE WAYS THIS IS EASY TO GET WRONG, all covered by tests:
 *
 * 1. WRAPPING. 22:00-07:00 must be quiet at 23:00 AND at 02:00. A naive
 *    `start <= now && now <= end` returns false for both.
 * 2. THE SERVER'S CLOCK. "07:00" means 07:00 where the PERSON is. Using the
 *    server's local time sends a 3am push to someone in another zone and looks
 *    perfectly correct in a test that runs in UTC.
 * 3. START EQUALS END. That is either "never quiet" or "quiet for 24 hours", and
 *    picking the wrong one silences every notification an account will ever get.
 *    It is treated as NEVER quiet, because the failure of being woken once is
 *    smaller than the failure of never being told anything, and a user who set
 *    it that way by accident would have no way to tell.
 */

export type QuietHours = {
  readonly enabled: boolean;
  /** "HH:MM" in 24-hour form, in `timeZone`. */
  readonly start: string;
  /** "HH:MM" in 24-hour form, in `timeZone`. */
  readonly end: string;
  /** IANA zone, e.g. "Asia/Kolkata". Falls back to UTC when unknown. */
  readonly timeZone: string;
};

export const QUIET_HOURS_DEFAULT: QuietHours = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  timeZone: "UTC",
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since local midnight, or null when the string is not "HH:MM". */
export function parseClock(value: string): number | null {
  const match = HHMM.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Minutes since midnight in `timeZone` at `at`.
 *
 * Intl rather than arithmetic: a fixed offset would be wrong twice a year in
 * every zone that observes daylight saving, and the bug would appear for one
 * hour and then vanish.
 */
export function minutesInZone(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // en-GB gives "07:05"; some ICU builds give "24:00" for midnight.
  const [hour, minute] = formatter.format(at).split(":").map(Number);
  return ((hour ?? 0) % 24) * 60 + (minute ?? 0);
}

/** True when `at` falls inside the quiet window, evaluated in its own zone. */
export function isWithinQuietHours(at: Date, config: QuietHours): boolean {
  if (!config.enabled) return false;

  const start = parseClock(config.start);
  const end = parseClock(config.end);
  // A malformed window must not silence an account. Failing open is the only
  // safe direction: a notification that should have been held is a small
  // annoyance, a notification that is never sent is a lost referral.
  if (start === null || end === null) return false;
  if (start === end) return false;

  let now: number;
  try {
    now = minutesInZone(at, config.timeZone);
  } catch {
    // An unknown IANA zone throws. Treat it as "not quiet" rather than
    // guessing an offset that could silence the account.
    return false;
  }

  // Wrapping windows (22:00-07:00) are the common case, not the exception:
  // `start > end` means the window crosses midnight, so it is quiet when the
  // time is after the start OR before the end.
  return start > end ? now >= start || now < end : now >= start && now < end;
}

/**
 * When the current quiet window ends, or null when it is not quiet now.
 *
 * Used to defer rather than drop: a held notification should go out when the
 * window closes, not be discarded. A dropped notification is indistinguishable
 * from a notification that was never generated.
 */
export function quietHoursEndsAt(at: Date, config: QuietHours): Date | null {
  if (!isWithinQuietHours(at, config)) return null;
  const end = parseClock(config.end);
  if (end === null) return null;

  // Walk forward a minute at a time up to 25 hours. Stepping rather than
  // computing an offset keeps daylight-saving transitions correct without a
  // second implementation of zone arithmetic.
  const candidate = new Date(at.getTime());
  for (let i = 0; i < 25 * 60; i += 1) {
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    if (!isWithinQuietHours(candidate, config)) return candidate;
  }
  return null;
}
