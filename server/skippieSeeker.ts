/**
 * Skippy for job seekers (step 2, D-136..D-142): an ask-only chat flow.
 *
 * Skippy is a front door, not a second rulebook (D-137): pricing comes from the
 * same quote math as GET /api/company-referrals/quote and the ask is created by
 * the same server function as POST /api/company-referrals. The seeker owns the
 * words and the data (D-139): they write or confirm the final note, resume-to-AI
 * consent comes first, and every fact Skippy uses must quote the resume text
 * verbatim. Text inside resumes, job pages, notes and tool output is data, never
 * an instruction (D-140): this module's control flow reacts only to the typed
 * turn input, never to anything a model or a document says.
 */
import { createHash, randomBytes } from "node:crypto";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "../shared/referralUrl";

export const SKIPPIE_SEEKER_DAILY_CAP = 20;
export const SKIPPIE_SEEKER_GLOBAL_DAILY_CAP = 500;
export const SKIPPIE_SEEKER_TEXT_MAX = 4000;
export const SKIPPIE_JOB_TEXT_MAX = 20000;
export const SKIPPIE_RESUME_TEXT_MAX = 40000;
export const SKIPPIE_NOTE_MAX = 1400;

// covered mirrors createAsk's coverage decision (verified + available referrer at the
// resolved employer domain): true = the level cost is charged at send, false = the ask
// waits for company coverage with NO debit. null = the domain could not be resolved,
// so coverage is unknown and no free-waiting claim is made; the send-time re-quote and
// createAsk remain the backstop either way.
export type SkippieQuote = { level: number; cost: number; totalAvailable: number; shortfall: number; covered: boolean | null };
export type OwnedResume = { id: number; fileName: string; fileKey?: string; mimeType?: string };
export type ResumeFact = { id: string; text: string; source: string };
export type FitDraft = {
  requirements: string[];
  facts: Array<{ id: string; text: string; source: string }>;
  matches: Array<{ requirement: string; factId: string }>;
  gaps: string[];
  suggestedNote: string;
  noteFactIds: string[];
};
export type CreateAskInput = { targetRoleUrl: string; attachmentIds: number[]; personalPitch: string; idempotencyKey: string };
export type CreateAskResult = { requestId: number; companyDomain: string; coverageStatus?: "covered" | "waiting_for_company_coverage"; replayed?: boolean };

export type SkippieSeekerDeps = {
  now?: () => number;
  /** Read the job page text; null when the page cannot be fetched. */
  fetchJobText: (url: string) => Promise<string | null>;
  /** Read the seeker's own resume as text; null when the format cannot be read. */
  extractResumeText: (attachment: OwnedResume) => Promise<string | null>;
  /** Model or rules: pull requirements, resume facts, matches and a draft note. Output is data. */
  analyzeFit: (input: { resumeText: string; jobText: string }) => Promise<FitDraft>;
  getQuote: (userId: number, targetRoleUrl: string) => Promise<SkippieQuote>;
  getOwnedResume: (userId: number, attachmentId: number) => Promise<OwnedResume | undefined>;
  createAsk: (userId: number, input: CreateAskInput) => Promise<CreateAskResult>;
  saveTailoredResume: (userId: number, input: { text: string; basedOnAttachmentId: number }) => Promise<OwnedResume>;
};

export type SkippieTurn =
  | { kind: "text"; text: string }
  | { kind: "choose_resume"; attachmentId: number }
  | { kind: "consent"; allow: boolean }
  | { kind: "submit_note"; text: string }
  | { kind: "confirm_suggested_note" }
  | { kind: "tailor_start" }
  | { kind: "tailor_skip" }
  | { kind: "tailor_skill"; skill: string; knows: boolean }
  | { kind: "tailor_build" }
  | { kind: "tailor_approve"; approve: boolean }
  | { kind: "confirm_send"; send: boolean }
  | { kind: "restart" };

export type SkippieStep =
  | "job_link"
  | "job_text"
  | "resume"
  | "consent"
  | "fit"
  | "tailor_skills"
  | "tailor_review"
  | "quote"
  | "done";

export type SkippieSession = {
  step: SkippieStep;
  idempotencyKey: string;
  targetRoleUrl?: string;
  submittedUrl?: string;
  jobText?: string;
  jobSource?: "link" | "pasted";
  requirements?: string[];
  attachmentId?: number;
  attachmentName?: string;
  resumeUnreadable?: boolean;
  consentToAi?: boolean;
  resumeText?: string;
  facts?: ResumeFact[];
  matches?: Array<{ requirement: string; factId: string }>;
  gaps?: string[];
  suggestedNote?: string;
  note?: string;
  noteSha256?: string;
  noteFlags?: string[];
  quote?: SkippieQuote;
  tailor?: { additions: Array<{ skill: string; confirmed: boolean | null }>; generatedText?: string };
  createdRequestId?: number;
  companyDomain?: string;
  coverageStatus?: "covered" | "waiting_for_company_coverage";
  replayed?: boolean;
};

export function newSkippieSession(rand: () => string = () => randomBytes(24).toString("base64url")): SkippieSession {
  return { step: "job_link", idempotencyKey: rand().slice(0, 40) };
}

/** What the client may see: everything except the raw resume/job text. */
export function publicSession(session: SkippieSession): Omit<SkippieSession, "resumeText" | "jobText" | "idempotencyKey"> {
  const { resumeText: _r, jobText: _j, idempotencyKey: _k, ...rest } = session;
  return rest;
}

/* ------------------------------------------------------------------ */
/* Grounding guarantees (D-139): verification, never trust the model.  */
/* ------------------------------------------------------------------ */

export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A fact is usable only when its source excerpt is verbatim resume text. */
export function verifyFacts(facts: FitDraft["facts"], resumeText: string): ResumeFact[] {
  const haystack = normalizeForMatch(resumeText);
  const seen = new Set<string>();
  const out: ResumeFact[] = [];
  for (const fact of facts) {
    const source = typeof fact?.source === "string" ? fact.source.trim() : "";
    const text = typeof fact?.text === "string" ? fact.text.trim().slice(0, 300) : "";
    if (!source || !text) continue;
    if (!haystack.includes(normalizeForMatch(source))) continue; // not in the resume: dropped
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push({ id: String(fact.id || `f${out.length + 1}`), text, source });
  }
  return out;
}

/** Skippy must ask, never promise: a draft that promises an outcome is refused. */
const PROMISE_RE = new RegExp("\\b(will refer|i'?ll refer|guaran" + "tee[ds]?\\b|prom" + "ise[ds]?\\b|you'?re hired|will get you (the|a|this|that)|definitely (get|land)|sure[- ]fire)\\b", "i");
export function promisesOutcome(text: string): boolean {
  return PROMISE_RE.test(text);
}

export function sanitizeNoteDraft(draft: string, facts: ResumeFact[], noteFactIds: string[]): string | undefined {
  const note = typeof draft === "string" ? draft.trim().replace(/\s+/g, " ") : "";
  if (!note || note.length > SKIPPIE_NOTE_MAX) return undefined;
  if (promisesOutcome(note)) return undefined;
  const ids = new Set(facts.map(f => f.id));
  if (!Array.isArray(noteFactIds) || noteFactIds.length === 0 || noteFactIds.some(id => !ids.has(id))) return undefined;
  return note;
}

export function verifyMatches(matches: FitDraft["matches"], facts: ResumeFact[], requirements: string[]): Array<{ requirement: string; factId: string }> {
  const ids = new Set(facts.map(f => f.id));
  const reqs = new Set(requirements);
  return (Array.isArray(matches) ? matches : []).filter(m => m && ids.has(String(m.factId)) && reqs.has(String(m.requirement))).map(m => ({ requirement: String(m.requirement), factId: String(m.factId) }));
}

export function sanitizeRequirements(list: string[]): string[] {
  const out: string[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    const clean = String(item ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Flag claims in the seeker's own note that the resume does not back up.
 * Deterministic part: numeric claims (years, percent, counts) must appear in
 * the resume text. Model-assisted checking can be layered by the caller; the
 * flags are advisory and shown to the seeker, who still owns the final words.
 */
export function flagUnsupportedClaims(note: string, resumeText: string): string[] {
  const haystack = normalizeForMatch(resumeText);
  const flags: string[] = [];
  const claims = note.match(/\d+(?:\.\d+)?\s?(?:%|percent|x|k|years?|months?|yrs?|million|users?|customers?|engineers?|people|teams?|projects?)(?=\W|$)/gi) ?? [];
  for (const claim of claims) {
    const number = claim.match(/\d+(?:\.\d+)?/)?.[0] ?? "";
    if (number && !haystack.includes(number)) flags.push(`"${claim.trim()}" is not in your resume`);
  }
  return flags;
}

/** Tailored resume = the seeker's own resume text plus the skills they confirmed. Nothing else is ever added. */
export function buildTailoredResumeText(resumeText: string, confirmedSkills: string[]): string {
  const additions = confirmedSkills.map(s => `- ${s}`).join("\n");
  return `${resumeText.trim()}\n\nAdditional skills (I confirm I know these):\n${additions}\n`;
}

/* ------------------------------------------------------------------ */
/* The state machine.                                                   */
/* ------------------------------------------------------------------ */

const ASK_ANYWAY = "You can still send your ask with your own note.";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

type Out = { session: SkippieSession; replies: string[] };

function quoteLine(quote: SkippieQuote): string {
  // A known-uncovered company waits free by contract (createAsk accepts with no
  // debit), so a short wallet is never pushed to top-up for it - and the
  // deferred charge is named with the quote's own grounded cost, never "1".
  if (quote.covered === false)
    return `No employee at this company is open on skipwait.me yet, so your ask waits - free - until one is. It uses ${quote.cost} credit${quote.cost === 1 ? "" : "s"} only at that moment. Send it?`;
  // Unknown coverage (the employer domain did not resolve) claims nothing free
  // and pushes no purchase: the send-time createAsk decides - charge, free
  // wait, or its own nothing-charged refusal.
  return quote.shortfall > 0 && quote.covered === true
    ? `This ask costs ${quote.cost} credit${quote.cost === 1 ? "" : "s"}. You have ${quote.totalAvailable}. Add credits on /plans first - Skippy never takes a payment.`
    : `This ask costs ${quote.cost} credit${quote.cost === 1 ? "" : "s"}. You have ${quote.totalAvailable}. Send it?`;
}

function fitReplies(session: SkippieSession): string[] {
  const replies: string[] = [];
  const reqs = session.requirements ?? [];
  if (reqs.length) replies.push(`Here's what the job asks for:\n${reqs.map(r => `- ${r}`).join("\n")}`);
  const factsById = new Map((session.facts ?? []).map(f => [f.id, f]));
  const matches = (session.matches ?? []).map(m => `- ${m.requirement}: ${factsById.get(m.factId)?.text ?? ""}`.trim());
  if (matches.length) replies.push(`Your strongest matches:\n${matches.join("\n")}`);
  if ((session.gaps ?? []).length) replies.push(`Gaps I could not find in your resume:\n${session.gaps!.map(g => `- ${g}`).join("\n")}\nIf you truly know any of these, I can build a tailored resume that adds only the ones you confirm.`);
  if (session.suggestedNote) replies.push(`A draft note for the referrer (edit it or write your own - the final words are yours):\n\n${session.suggestedNote}`);
  return replies;
}

async function runFitAnalysis(userId: number, session: SkippieSession, deps: SkippieSeekerDeps): Promise<SkippieSession> {
  if (!session.resumeText || !session.jobText) return session;
  const draft = await deps.analyzeFit({ resumeText: session.resumeText, jobText: session.jobText });
  const requirements = sanitizeRequirements(draft.requirements?.length ? draft.requirements : session.requirements ?? []);
  const facts = verifyFacts(draft.facts ?? [], session.resumeText);
  const matches = verifyMatches(draft.matches ?? [], facts, requirements);
  const matched = new Set(matches.map(m => m.requirement));
  const gaps = sanitizeRequirements(draft.gaps ?? []).filter(g => requirements.includes(g) && !matched.has(g));
  const suggestedNote = sanitizeNoteDraft(draft.suggestedNote ?? "", facts, Array.isArray(draft.noteFactIds) ? draft.noteFactIds : []);
  return { ...session, requirements, facts, matches, gaps: gaps.length ? gaps : requirements.filter(r => !matched.has(r)), suggestedNote };
}

async function quoteStep(userId: number, session: SkippieSession, deps: SkippieSeekerDeps): Promise<SkippieSession> {
  const quote = await deps.getQuote(userId, session.targetRoleUrl!);
  return { ...session, step: "quote", quote };
}

export async function advanceSkippieSeeker(userId: number, current: SkippieSession, input: SkippieTurn, deps: SkippieSeekerDeps): Promise<Out> {
  const session: SkippieSession = { ...current };
  const say = (...replies: string[]): Out => ({ session, replies });

  if (input.kind === "restart") return { session: newSkippieSession(), replies: ["Fresh start. Which company do you want a referral at? Paste the job link and I'll help you make the strongest ask."] };

  switch (session.step) {
    case "job_link": {
      if (input.kind !== "text") return say("Paste the link to the job you want a referral for.");
      const raw = input.text.trim().slice(0, 2048);
      if (!isValidTargetRoleUrl(raw)) return say(TARGET_ROLE_URL_ERROR);
      session.targetRoleUrl = normalizeTargetRoleUrl(raw);
      session.submittedUrl = raw;
      const pageText = (await deps.fetchJobText(session.targetRoleUrl).catch(() => null))?.slice(0, SKIPPIE_JOB_TEXT_MAX);
      if (pageText && pageText.trim().length >= 80) {
        session.jobText = pageText;
        session.jobSource = "link";
        session.step = "resume";
        return say("I've read the job post. Now your resume: upload a fresh one or pick a saved one.");
      }
      session.step = "job_text";
      return say("I couldn't open that job page (some sites block reading). Paste the job description text here and I'll work from that.");
    }

    case "job_text": {
      if (input.kind !== "text") return say("Paste the job description text from the job post.");
      const text = input.text.trim().slice(0, SKIPPIE_JOB_TEXT_MAX);
      if (text.length < 80) return say("That's too short to be a job description. Paste the full text of the job post.");
      session.jobText = text;
      session.jobSource = "pasted";
      session.step = "resume";
      return say("Got the job description. Now your resume: upload a fresh one or pick a saved one.");
    }

    case "resume": {
      if (input.kind !== "choose_resume") return say("Upload a resume file or choose one of your saved resumes.");
      const owned = await deps.getOwnedResume(userId, input.attachmentId);
      if (!owned) return say("I can't use that file. Pick a resume you uploaded from your account.");
      session.attachmentId = owned.id;
      session.attachmentName = owned.fileName;
      session.step = "consent";
      return say(`Using "${owned.fileName}". May Skippy read your resume with the AI model to compare it against the job and help with your note? The resume text is used only for this. Say yes or no.`);
    }

    case "consent": {
      if (input.kind === "consent" && !input.allow) {
        session.consentToAi = false;
        session.step = "quote";
        const quoted = await quoteStep(userId, session, deps);
        return { session: quoted, replies: ["No problem - I'll leave your resume unread.", "Write your note to the referrer (a short reason you're a strong fit), then confirm the cost.", quoteLine(quoted.quote!)] };
      }
      if (input.kind !== "consent" || input.allow !== true) return say("May Skippy read your resume with the AI model to compare it against the job? Yes or no.");
      session.consentToAi = true;
      const attachment = await deps.getOwnedResume(userId, session.attachmentId!);
      const resumeText = attachment ? (await deps.extractResumeText(attachment).catch(() => null))?.slice(0, SKIPPIE_RESUME_TEXT_MAX) : null;
      if (!resumeText || resumeText.trim().length < 40) {
        session.resumeUnreadable = true;
        session.step = "fit";
        return say("I couldn't read the text in that file (scanned images and some formats don't work yet). " + ASK_ANYWAY, "Write your note to the referrer, or start over with a PDF or Word resume that has selectable text.");
      }
      session.resumeText = resumeText;
      const analyzed = await runFitAnalysis(userId, session, deps);
      analyzed.step = "fit";
      return { session: analyzed, replies: fitReplies(analyzed) };
    }

    case "fit": {
      if (input.kind === "tailor_start") {
        const gaps = session.gaps ?? [];
        if (!gaps.length || !session.resumeText) return say("There's nothing missing to add. Your note is next - write it or use the draft.");
        session.tailor = { additions: gaps.map(skill => ({ skill, confirmed: null })) };
        session.step = "tailor_skills";
        return say("The job asks for things I couldn't find in your resume. For each one, tell me honestly: do you know it? I'll only add what you confirm.");
      }
      if (input.kind === "tailor_skip") return say("Keeping your original resume. Write your note or use the draft.");
      if (input.kind === "submit_note") {
        const note = input.text.trim().slice(0, SKIPPIE_NOTE_MAX);
        if (note.length < 4) return say("Write a short note first (or confirm the draft).");
        session.note = note;
        session.noteSha256 = sha256(note);
        session.noteFlags = session.resumeText ? flagUnsupportedClaims(note, session.resumeText) : [];
        const quoted = await quoteStep(userId, session, deps);
        const flagLine = quoted.noteFlags?.length ? `Heads up - I couldn't find this in your resume, so double-check it: ${quoted.noteFlags.join("; ")}.` : undefined;
        return { session: quoted, replies: ["Your note is saved exactly as written.", ...(flagLine ? [flagLine] : []), quoteLine(quoted.quote!)] };
      }
      if (input.kind === "confirm_suggested_note") {
        if (!session.suggestedNote) return say("There's no draft to confirm. Write your note instead.");
        session.note = session.suggestedNote;
        session.noteSha256 = sha256(session.note);
        session.noteFlags = [];
        const quoted = await quoteStep(userId, session, deps);
        return { session: quoted, replies: ["Your note is saved exactly as written.", quoteLine(quoted.quote!)] };
      }
      if (input.kind === "text") return say("To use that as your note, send it with the note button below the editor - or confirm the draft.");
      return say("Write your note, confirm the draft, or ask me for a tailored resume.");
    }

    case "tailor_skills": {
      if (input.kind === "tailor_skill") {
        const entry = session.tailor?.additions.find(a => a.skill === input.skill);
        if (!entry) return say("That skill isn't in the list from the job post. I can only add requirements from the job.");
        entry.confirmed = input.knows;
        return say(input.knows ? `Marked "${entry.skill}" as something you know.` : `Leaving "${entry.skill}" out.`);
      }
      if (input.kind === "tailor_build") {
        const confirmed = (session.tailor?.additions ?? []).filter(a => a.confirmed === true).map(a => a.skill);
        if (!confirmed.length) return say("You haven't confirmed any of these, so there's nothing honest to add. I'll keep your original resume.", "Keeping your original resume. Write your note or use the draft.");
        const text = buildTailoredResumeText(session.resumeText!, confirmed);
        session.tailor = { additions: session.tailor!.additions, generatedText: text };
        session.step = "tailor_review";
        return say("Here's the tailored resume. It's your original resume plus only the skills you confirmed - nothing else changed. Read it, then choose: use it for this ask, or keep your original.", text);
      }
      return say("Answer yes or no for each skill, then build the tailored resume.");
    }

    case "tailor_review": {
      if (input.kind === "tailor_approve" && !input.approve) {
        session.tailor = undefined;
        session.step = "fit";
        return say("No changes made - your original resume stays. Write your note or use the draft.");
      }
      if (input.kind !== "tailor_approve") return say("Use the tailored resume for this ask, or keep your original?");
      const text = session.tailor?.generatedText;
      if (!text) return say("There's no tailored resume yet.");
      const originalName = session.attachmentName ?? "original resume";
      const saved = await deps.saveTailoredResume(userId, { text, basedOnAttachmentId: session.attachmentId! });
      session.attachmentId = saved.id;
      session.attachmentName = saved.fileName;
      session.tailor = undefined;
      // The confirmed skills are now on the resume; refresh the comparison honestly.
      session.resumeText = text;
      const analyzed = await runFitAnalysis(userId, session, deps);
      analyzed.step = "fit";
      return { session: analyzed, replies: [`Saved "${saved.fileName}" and set it as the resume for this ask. Your original "${originalName}" is untouched.`, ...fitReplies(analyzed)] };
    }

    case "quote": {
      if (input.kind === "submit_note") {
        const note = input.text.trim().slice(0, SKIPPIE_NOTE_MAX);
        if (note.length < 4) return say("Write a short note first.");
        session.note = note;
        session.noteSha256 = sha256(note);
        session.noteFlags = session.resumeText ? flagUnsupportedClaims(note, session.resumeText) : [];
        const quoted = await quoteStep(userId, session, deps);
        const flagLine = quoted.noteFlags?.length ? `Heads up - I couldn't find this in your resume, so double-check it: ${quoted.noteFlags.join("; ")}.` : undefined;
        return { session: quoted, replies: ["Your note is saved exactly as written.", ...(flagLine ? [flagLine] : []), quoteLine(quoted.quote!)] };
      }
      if (input.kind === "confirm_send" && !input.send) {
        session.step = "fit";
        return say("No problem - nothing was sent and nothing was spent. You can keep editing your note.");
      }
      if (input.kind !== "confirm_send") return say(session.quote?.shortfall && session.quote.covered === true ? "Add credits on /plans first - Skippy never takes a payment." : 'Say "Send it" to send your ask, or "not yet" to keep editing.');
      if (!session.note) return say("Write your note to the referrer first - the final words are yours.");
      if (!session.noteSha256 || session.noteSha256 !== sha256(session.note)) return say("Your note changed since you confirmed it. Confirm the final words again before sending.");
      // Price is live, never hardcoded: quote again at send time and refuse drift.
      const shown = session.quote;
      const fresh = await deps.getQuote(userId, session.targetRoleUrl!);
      session.quote = fresh;
      // The confirmed quote is the representation the seeker said yes to. If
      // coverage or price moved since (a company opened up, the flag changed),
      // a funded wallet must not be charged against the old words: show the
      // fresh numbers and ask for a new confirmation. The fresh quote is
      // already stored, so the next "Send it" confirms the new price.
      if (shown && (shown.covered !== fresh.covered || shown.cost !== fresh.cost)) {
        return say(`The price or coverage for this ask changed since you confirmed. ${quoteLine(fresh)} Nothing was sent and nothing was charged.`);
      }
      // The short-wallet refusal applies only when coverage is KNOWN to mean a
      // charge is coming (covered === true). Known-uncovered waits free by
      // contract; unknown coverage claims nothing free and pushes no purchase -
      // createAsk then decides: charge, free wait, or its own nothing-charged
      // refusal, and the catch below reports it.
      if (fresh.shortfall > 0 && fresh.covered === true) return say(`This ask costs ${fresh.cost} credit${fresh.cost === 1 ? "" : "s"} and you have ${fresh.totalAvailable}. Nothing was sent and nothing was charged. Add credits on /plans first.`);
      let result: CreateAskResult;
      try {
        result = await deps.createAsk(userId, { targetRoleUrl: session.targetRoleUrl!, attachmentIds: [session.attachmentId!], personalPitch: session.note, idempotencyKey: session.idempotencyKey });
      } catch (error) {
        return say(`The ask could not be sent: ${error instanceof Error ? error.message : "please try again"}. Nothing was charged.`);
      }
      session.createdRequestId = result.requestId;
      session.companyDomain = result.companyDomain;
      session.coverageStatus = result.coverageStatus ?? "covered";
      session.replayed = Boolean(result.replayed);
      session.step = "done";
      if (session.coverageStatus === "waiting_for_company_coverage") {
        return say(`Your ask is saved for ${result.companyDomain}. No employee there is open on skipwait.me yet, so it cost you nothing: it's held (never shown) and nothing is charged while it waits. When a verified employee can see it, ${fresh.cost} credit${fresh.cost === 1 ? "" : "s"} are used and it goes live; if you don't have enough then, we hold it until you add more. We'll tell you when that happens. Track it under My asks.`);
      }
      if (session.replayed) {
        return say(`Asked - this is the same request you already sent to ${result.companyDomain}, so nothing was charged again. Track it under My asks.`);
      }
      // The number is the fresh send-time quote, which the seeker confirmed
      // (any drift forced a re-confirmation above), so the words match the charge.
      return say(`Asked - your request is with verified employees at ${result.companyDomain}. ${fresh.cost} credit${fresh.cost === 1 ? " was" : "s were"} used, exactly the cost you confirmed. If nobody picks it up you can withdraw it for the credit back. Track it under My asks.`);
    }

    case "done": {
      return say("Your ask is already in. Start over if you want to ask at another company.");
    }
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic fallback analysis (no model configured).              */
/* ------------------------------------------------------------------ */

const REQUIREMENT_HEADING = /(requirements|qualifications|what you'?ll (bring|need)|who you are|must[- ]have|skills)/i;
const REQUIREMENT_WORD = /(experience|proficien\w+|familiar\w+|knowledge|degree|skill|ability|expertise|fluent|strong)\w*/i;

function bulletLines(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.replace(/^\s*[-•*▪◦·]+\s*/, "").trim()).filter(l => l.length >= 12 && l.length <= 300);
}

export function rulesExtractRequirements(jobText: string): string[] {
  const lines = jobText.split(/\r?\n/);
  const out: string[] = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (REQUIREMENT_HEADING.test(line) && line.length < 90) { inSection = true; continue; }
    const cleaned = line.replace(/^\s*[-•*▪◦·]+\s*/, "").trim();
    if (inSection && cleaned.length >= 12) { out.push(cleaned); if (out.length >= 8) break; continue; }
    if (!inSection && REQUIREMENT_WORD.test(line) && cleaned.length >= 20) { out.push(cleaned); if (out.length >= 8) break; }
  }
  if (!out.length) out.push(...bulletLines(jobText).slice(0, 5));
  return sanitizeRequirements(out);
}

function keywordOverlap(a: string, b: string): boolean {
  const tokens = normalizeForMatch(b).split(/[^a-z0-9+#.]+/).filter(t => t.length >= 4);
  const hay = normalizeForMatch(a);
  return tokens.some(t => hay.includes(t));
}

/** Rules-mode fit analysis: honest, simple, and grounded in the same verification as the model path. */
export function rulesAnalyzeFit(input: { resumeText: string; jobText: string }): FitDraft {
  const requirements = rulesExtractRequirements(input.jobText);
  const lines = bulletLines(input.resumeText).slice(0, 40);
  const facts = lines.map((line, i) => ({ id: `f${i + 1}`, text: line.slice(0, 300), source: line }));
  const matches: FitDraft["matches"] = [];
  for (const req of requirements) {
    const fact = facts.find(f => keywordOverlap(f.source, req));
    if (fact) matches.push({ requirement: req, factId: fact.id });
  }
  const matched = new Set(matches.map(m => m.requirement));
  const gaps = requirements.filter(r => !matched.has(r));
  const top = matches.slice(0, 2).map(m => facts.find(f => f.id === m.factId)!.text);
  const suggestedNote = top.length
    ? `Hi - I'd like to ask for a referral for this role. From my resume: ${top.join("; ")}. That lines up with what the job asks for (${matches[0].requirement.slice(0, 120)}). Would you be open to referring me? Happy to share anything else that helps.`
    : `Hi - I'd like to ask for a referral for this role. I've attached my resume and would be grateful if you'd take a look. Would you be open to referring me?`;
  return { requirements, facts, matches, gaps, suggestedNote, noteFactIds: matches.slice(0, 2).map(m => m.factId) };
}
