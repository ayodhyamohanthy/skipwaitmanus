/**
 * Ask quality: the check that decides whether a seeker is referable.
 *
 * CHECKLIST.md, Completion flows: "Ask quality checks run client-side and again server-side."
 * Before this, `personalPitch` was trimmed and capped at 2000 characters and nothing else — an
 * empty note silently became "No personal note was included with this referral request."
 *
 * WHY A SHARED MODULE: the same check has to run in the Ask form, as the user types, and on the
 * server, when the ask is submitted. Two implementations would eventually disagree, and the
 * failure is one-sided: the form says "looks good" while the server rejects it, or vice versa.
 * One pure function, imported by both, is the only version that cannot drift.
 *
 * THE GROWTH NOTE'S ITEM 4 is exactly this: make every seeker referral-worthy, then charge for
 * the coaching that fixes a rejected ask. The check is the free half. It has to be honest —
 * a check that always passes is decoration, and one that blocks legitimate asks drives seekers
 * off before a referrer ever sees them.
 *
 * WHAT IT IS DELIBERATELY NOT: a quality gate. A finding is advisory, and the ask still goes out
 * if the seeker insists — a server-side gate on note quality would gate the only demand this
 * product has (docs/GROWTH_STRATEGY.md). The send route refuses exactly one finding: a note that
 * carries contact details, because the thread hides them until BOTH sides agree, and every other
 * finding is advice — see `BLOCKING_CODES`.
 */

/** Below this, a note is not a pitch. 40 characters is roughly one short sentence. */
export const MIN_PITCH_CHARS = 40;
/** Past this, nothing more is gained and the referrer stops reading. */
export const MAX_PITCH_CHARS = 2000;

export type PitchFinding = { readonly code: PitchFindingCode; readonly message: string };

export type PitchFindingCode =
  | "empty"
  | "too_short"
  | "filler"
  | "contact_details"
  | "all_caps"
  | "no_specifics";

/**
 * Codes that must stop the ask rather than advise.
 *
 * `contact_details` is the one with a product reason behind it, not a taste one: the thread
 * reveals identities only after acceptance, and contact details stay hidden until BOTH sides
 * agree. A phone number or email typed into the pitch quietly bypasses that promise — the
 * referrer reads it, no consent was given, and the privacy rule the product advertises is
 * broken by a single field nobody was watching.
 */
export const BLOCKING_CODES: readonly PitchFindingCode[] = ["contact_details"];

/**
 * The code `POST /api/company-referrals` returns when a blocking finding refuses an ask.
 * Exported so the route, its tests and any client mapping cannot drift on the string.
 */
export const PITCH_REFUSAL_CODE = "pitch_contact_details";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3}[\s.-]?\d{3,4}/;
const WHATSAPP = /\b(?:whatsapp|watsapp|telegram|signal|dm me|ping me|reach me at)\b/i;

/**
 * Repeated filler a referrer reads as "did not read the form": keyboard runs, single letters
 * run out, and words that say nothing. Matched on the collapsed body so line breaks and extra
 * spaces cannot disguise it.
 */
const FILLER = new Set([
  "asdf", "asdfg", "qwer", "qwerty", "test", "testing", "please refer me",
  "i want referral", "refer me", "hello", "hi", "help", "resume attached", "lorem ipsum",
  "abc", "xxx", "aaaa", "na", "nil", "none",
].map(term => term.replace(/\s+/g, "")));

/** Words that suggest the note names something concrete about the role or the person. */
const SPECIFIC_HINTS = [
  /\b(?:i|i'm|i am)\s+(?:currently|now)\b/i,
  /\b(?:i|i've|i have)\s+(?:worked|built|shipped|led|managed|designed)\b/i,
  /\b(?:years?|yr)\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\b(?:role|position|team|jd|job description)\b/i,
  /\b(?:because|specifically|particularly)\b/i,
  /\bmy\s+(?:resume|background|experience|work)\b/i,
];

/**
 * Check a pitch and return every finding, in the order they should be shown.
 *
 * Pure, synchronous, and safe to run on every keystroke.
 */
export function checkPitchQuality(pitch: string): PitchFinding[] {
  const trimmed = typeof pitch === "string" ? pitch.trim() : "";
  if (trimmed === "") return [{ code: "empty", message: "A personal note is what a referrer reads first — write a few sentences." }];

  const findings: PitchFinding[] = [];
  const collapsed = trimmed.replace(/\s+/g, " ");

  if (trimmed.length < MIN_PITCH_CHARS) {
    findings.push({
      code: "too_short",
      message: `Your note is ${trimmed.length} characters. ${MIN_PITCH_CHARS} is about one sentence — enough for a referrer to know why you and why this role.`,
    });
  }

  // Filler, judged on the squashed body: "t e s t", "TEST!" and "test" are the same placeholder.
  const bare = collapsed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (FILLER.has(bare) || /^(.)\1{4,}$/.test(bare)) {
    findings.push({ code: "filler", message: "This reads as a placeholder. A referrer can tell, and it is the fastest way to be passed over." });
  }

  // Contact details bypass the "hidden until both agree" promise.
  if (EMAIL.test(collapsed) || WHATSAPP.test(collapsed) || PHONE.test(collapsed.replace(/\s{2,}/g, " "))) {
    findings.push({
      code: "contact_details",
      message: "Take out your email or phone number. The thread reveals contact details only after you both agree — putting it in the note skips that consent.",
    });
  }

  // Shouting, measured on letters only so an acronym in an otherwise normal note is fine.
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 20) {
    const upper = trimmed.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length > 0.7) {
      findings.push({ code: "all_caps", message: "Written in all caps, this reads as shouting. Sentence case gets a fairer read." });
    }
  }

  // No specifics at all: nothing the referrer could latch onto. Only worth saying once the note
  // is long enough that its absence is a choice rather than a length limit.
  if (trimmed.length >= MIN_PITCH_CHARS && !SPECIFIC_HINTS.some(pattern => pattern.test(collapsed))) {
    findings.push({
      code: "no_specifics",
      message: "Add one concrete thing: your background, why this role, or what you have built. It is the part that turns a generic ask into a referable one.",
    });
  }

  return findings;
}

/** The findings that must stop the ask, if any. */
export function blockingPitchFindings(pitch: string): PitchFinding[] {
  return checkPitchQuality(pitch).filter(finding => BLOCKING_CODES.includes(finding.code));
}

/** True when the pitch is fit to send without advice. */
export function isPitchReferable(pitch: string): boolean {
  return checkPitchQuality(pitch).length === 0;
}
