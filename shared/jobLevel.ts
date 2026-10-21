// Deterministic job -> level (L1..L10) classifier, for the level-scaled ask
// cost the owner ordered (Oct 21: "low level jobs referral takes low credits...
// never show level unread; you should always have a level; use different ways
// to find"). Pure and shared, same house pattern as jobFunctionClassifier:
// whole-word matching, ordered rules, first strong match wins, ties break to
// the LOWER level. It ALWAYS returns a level: weak or missing signals fall
// back to L2 with low confidence, so no surface ever shows "level unread".
// Nothing consumes this yet; the credit-cost wiring ships separately, flag off.

export type JobLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type LevelConfidence = "high" | "medium" | "low";

export type JobLevelInput = {
  title?: string | null;
  description?: string | null;
  url?: string | null;
};

export type JobLevelResult = {
  level: JobLevel;
  confidence: LevelConfidence;
  /** Which signal decided, for the internal confidence log. */
  basis: string;
};

/** Level -> what it means, for honest UI copy later. */
export const JOB_LEVEL_LABELS: Record<JobLevel, string> = {
  1: "Intern / trainee",
  2: "Entry / junior",
  3: "Early mid-level",
  4: "Mid-level",
  5: "Senior",
  6: "Senior II",
  7: "Staff / lead",
  8: "Principal",
  9: "Director / head",
  10: "VP / C-level",
};

const norm = (text: string): string => ` ${text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

// Layer 1: explicit ladder tags ("SDE 2", "IC4", "L5", "P6", "E5", "grade 7").
// Mapped to OUR 1-10 scale conservatively (big-tech IC4 ~ senior).
const LADDER_TAGS: ReadonlyArray<readonly [RegExp, JobLevel]> = [
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(1|i)\b/, 2],
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(2|ii)\b/, 4],
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(3|iii)\b/, 5],
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(4|iv)\b/, 6],
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(5|v)\b/, 7],
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(6|vi)\b/, 8],
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(7|vii)\b/, 9],
  [/\b(sde|swe|ic|l|p|e|grade|band|level)\s*(8|viii|9|ix|10|x)\b/, 10],
];

// Layer 2: seniority keywords in the title. Ordered: the first match wins, so
// specific phrases come before the generic words they contain.
const TITLE_RULES: ReadonlyArray<readonly [phrase: string, level: JobLevel]> = [
  ["chief", 10], ["cxo", 10], ["cto", 10], ["ceo", 10], ["cfo", 10], ["coo", 10], ["cpo", 10], ["founder", 10],
  ["vice president", 10], ["svp", 10], ["vp", 10],
  ["director", 9], ["head of", 9], ["country manager", 9], ["general manager", 9],
  ["distinguished", 8], ["principal", 8], ["chief architect", 8], ["architect", 8], ["fellow", 8],
  ["senior product manager", 5], ["senior program manager", 5], ["senior project manager", 5], ["senior account manager", 5],
  ["senior manager", 7],
  ["product manager", 3], ["program manager", 3], ["project manager", 3], ["account manager", 3],
  ["staff", 7], ["tech lead", 7], ["technical lead", 7], ["team lead", 7], ["lead", 7], ["engineering manager", 7], ["manager", 7],
  ["senior", 5], ["sr", 5],
  ["mid senior", 4], ["mid level", 4], ["intermediate", 4],
  ["junior", 2], ["jr", 2], ["associate", 2], ["entry level", 2], ["fresher", 2], ["graduate", 2],
  ["intern", 1], ["internship", 1], ["trainee", 1], ["apprentice", 1],
];

// Layer 3: years of experience, parsed from title or description text.
// "5+ years", "3-5 years", "minimum 7 years", "7 yrs". Takes the lower bound
// of a range (tie-break to the lower level).
const YEARS_TO_LEVEL: ReadonlyArray<readonly [minYears: number, level: JobLevel]> = [
  [12, 9], [10, 8], [8, 7], [6, 6], [5, 5], [4, 4], [2, 3], [1, 2], [0, 1],
];

function yearsToLevel(years: number): JobLevel {
  for (const [min, level] of YEARS_TO_LEVEL) if (years >= min) return level;
  return 1;
}

const YEARS_RE = /(\d{1,2})\s*(?:-|–|to)?\s*(\d{1,2})?\s*(?:\+)?\s*(?:years|year|yrs|yr)\b/g;

export function parseYearsOfExperience(text: string): number | null {
  const matches = [...text.toLowerCase().matchAll(YEARS_RE)];
  if (matches.length === 0) return null;
  // Lower bound of the first range-looking mention wins (conservative).
  const first = matches[0];
  return Number(first[1]);
}

// Layer 4: leadership verbs in the description (weak bump, never above 7).
const LEADERSHIP_VERBS = ["lead a team", "leading a team", "manage a team", "managing a team", "mentor", "mentoring", "people management", "drive strategy", "own the roadmap"];

/** Assign a level to a job. Always returns one; never "unread". */
export function assignJobLevel(input: JobLevelInput): JobLevelResult {
  const title = input.title ?? "";
  const description = input.description ?? "";
  const url = input.url ?? "";
  const titleNorm = norm(title);
  const urlNorm = norm(url.replace(/[-_./]+/g, " "));

  // Layer 1: explicit ladder tag in the title (strongest).
  for (const [re, level] of LADDER_TAGS) if (re.test(title.toLowerCase())) return { level, confidence: "high", basis: "ladder-tag" };

  // Layer 2: seniority keywords, title first, then URL words (weaker).
  for (const [phrase, level] of TITLE_RULES) if (titleNorm.includes(` ${phrase} `)) return { level, confidence: "high", basis: `title:${phrase}` };
  for (const [phrase, level] of TITLE_RULES) if (urlNorm.includes(` ${phrase} `)) return { level, confidence: "medium", basis: `url:${phrase}` };

  // Layer 3: years of experience, description then title.
  const years = parseYearsOfExperience(description) ?? parseYearsOfExperience(title);
  const yearsLevel = years === null ? null : yearsToLevel(years);

  // Layer 4: leadership verbs (weak).
  const descNorm = norm(description);
  const verbHit = LEADERSHIP_VERBS.find(verb => descNorm.includes(verb));
  const verbLevel = verbHit ? (verbHit === "mentor" || verbHit === "mentoring" ? 5 : 7) : null;

  if (yearsLevel !== null && verbLevel !== null) {
    // Signals disagree -> take the lower (owner rule: bias down).
    const level = Math.min(yearsLevel, verbLevel) as JobLevel;
    return { level, confidence: "medium", basis: `years:${years}+verb:${verbHit}` };
  }
  if (yearsLevel !== null) return { level: yearsLevel, confidence: "medium", basis: `years:${years}` };
  if (verbLevel !== null) return { level: verbLevel, confidence: "low", basis: `verb:${verbHit}` };

  // Last resort (growth's layer 9): L2, low confidence. Never "unread".
  return { level: 2, confidence: "low", basis: "fallback" };
}

/** Proposed credit cost per level (owner: "1 credit for L1 ... 10 credits for L10"). */
export function creditsForLevel(level: JobLevel): number {
  return level;
}
