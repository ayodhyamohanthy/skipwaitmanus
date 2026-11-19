// Skippy, admin step 4: approval cards for low-risk actions (D-140).
// Skippy may PROPOSE an action; nothing runs until the signed-in admin who owns
// the card presses Approve on the cards endpoint. A card is bound to the exact
// action and parameters stored here at proposal time, is one-use, expires in
// 5 minutes, and is never reachable from model output or from text in user data.
// Low-risk actions only: no money, no refunds, no credit grants.
import { randomBytes } from "node:crypto";
import type { ScheduledJobDefinition } from "./scheduledJobRunner";

export const CARD_TTL_MS = 5 * 60_000;
export const CARD_MAX_PENDING_PER_ADMIN = 10;
export const CARD_ACTIONS = ["rerun_job", "open_linear_issue", "draft_pr_description"] as const;
export type CardAction = (typeof CARD_ACTIONS)[number];

export type ProposalInput = { action: string; job?: unknown; title?: unknown; body?: unknown; notes?: unknown };
export type CardParams =
  | { action: "rerun_job"; job: string; windowKey: string }
  | { action: "open_linear_issue"; title: string; body: string }
  | { action: "draft_pr_description"; title: string; notes: string };

export type CardView = { id: string; action: CardAction; will: string; affects: string; undo: string; expiresAt: string };
export type CardState = "pending" | "approved" | "denied" | "expired";
type StoredCard = { view: CardView; params: CardParams; adminId: number; expiresAtMs: number; state: CardState };

export type CardJobStatus = { status: string; windowKey: string } | undefined;
export type CardDeps = {
  now: () => number;
  jobs: readonly ScheduledJobDefinition[];
  /** Latest run of a job, any status. */
  latestRun: (job: string) => Promise<CardJobStatus>;
  /** The window key the runner would use right now for this job. */
  currentWindowKey: (job: ScheduledJobDefinition, nowMs: number) => string;
  /** Re-runs one job through the normal runner. */
  rerun: (job: ScheduledJobDefinition) => Promise<{ outcome: string; processed: number; failed: number }>;
  /** Creates a Linear issue. Absent when this app has no Linear client: the card then saves a draft only. */
  createLinearIssue?: (title: string, body: string) => Promise<{ url: string }>;
  audit: (entry: { adminId: number; action: string; outcome: "success" | "failure" | "denied"; cardId?: string; metadata: Record<string, string | number | boolean | null> }) => void;
};

export type CardResult = { ok: boolean; state: CardState | "unknown"; message: string; output?: string };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n) : "");

export function createCardStore(deps: CardDeps) {
  const cards = new Map<string, StoredCard>();
  const sweep = () => {
    const t = deps.now();
    for (const [id, c] of Array.from(cards)) if (c.expiresAtMs + CARD_TTL_MS < t) cards.delete(id);
  };

  async function propose(adminId: number, input: ProposalInput): Promise<{ card?: CardView; refused?: string }> {
    sweep();
    const audit = (outcome: "success" | "denied", metadata: Record<string, string | number | boolean | null>, cardId?: string) => deps.audit({ adminId, action: "admin.skippie_card_proposed", outcome, cardId, metadata });
    const pending = Array.from(cards.values()).filter(c => c.adminId === adminId && c.state === "pending" && c.expiresAtMs > deps.now()).length;
    if (pending >= CARD_MAX_PENDING_PER_ADMIN) { audit("denied", { reason: "too many pending cards" }); return { refused: "Too many cards are waiting. Approve or deny some first." }; }
    let params: CardParams; let view: Omit<CardView, "id" | "expiresAt">;
    if (input.action === "rerun_job") {
      const job = deps.jobs.find(j => j.name === input.job);
      if (!job) { audit("denied", { reason: "unknown job", action: "rerun_job" }); return { refused: "That is not a scheduled job." }; }
      const last = await deps.latestRun(job.name);
      if (!last || last.status !== "failed") { audit("denied", { reason: "latest run not failed", action: "rerun_job", job: job.name }); return { refused: `${job.name} has no failed run to re-run.` }; }
      if (deps.currentWindowKey(job, deps.now()) !== last.windowKey) { audit("denied", { reason: "failed window is over", action: "rerun_job", job: job.name }); return { refused: `The failed ${job.name} window is over. The next tick runs the new window.` }; }
      params = { action: "rerun_job", job: job.name, windowKey: last.windowKey };
      view = { action: "rerun_job", will: `Re-run the scheduled job "${job.name}" once, for its current window (${last.windowKey}), through the normal job runner.`, affects: `Only ${job.name}. The runner skips it if it already succeeded or is leased, and stops after its attempt limit.`, undo: "Cannot be undone, but the job is built to be safe to repeat. Nothing else runs." };
    } else if (input.action === "open_linear_issue") {
      const title = clip(input.title, 200); const body = clip(input.body, 4000);
      if (!title) { audit("denied", { reason: "empty title", action: "open_linear_issue" }); return { refused: "An issue needs a title." }; }
      params = { action: "open_linear_issue", title, body };
      view = deps.createLinearIssue
        ? { action: "open_linear_issue", will: `Open one Linear issue titled "${title}".`, affects: "Adds one issue to the Linear workspace. Nothing in skipwait.me changes.", undo: "Close or delete the issue in Linear." }
        : { action: "open_linear_issue", will: `Save a DRAFT Linear issue titled "${title}". This app has no Linear connection, so nothing will be created in Linear.`, affects: "Nothing outside this card. You get the draft text to paste.", undo: "Nothing to undo." };
    } else if (input.action === "draft_pr_description") {
      const title = clip(input.title, 200); const notes = clip(input.notes, 4000);
      if (!title) { audit("denied", { reason: "empty title", action: "draft_pr_description" }); return { refused: "A PR description needs a title." }; }
      params = { action: "draft_pr_description", title, notes };
      view = { action: "draft_pr_description", will: `Write a draft pull request description for "${title}" from your notes.`, affects: "Text only, shown here. It is not posted to GitHub.", undo: "Nothing to undo." };
    } else { audit("denied", { reason: "action not allowed", action: clip(input.action, 40) }); return { refused: "That action is not available to Skippy." }; }
    const id = randomBytes(24).toString("hex");
    const expiresAtMs = deps.now() + CARD_TTL_MS;
    const full: CardView = { id, ...view, expiresAt: new Date(expiresAtMs).toISOString() };
    cards.set(id, { view: full, params, adminId, expiresAtMs, state: "pending" });
    audit("success", { action: params.action, expiresAt: full.expiresAt }, id);
    return { card: full };
  }

  async function decide(adminId: number, id: string, decision: "approve" | "deny"): Promise<CardResult> {
    sweep();
    const auditD = (outcome: "success" | "failure" | "denied", metadata: Record<string, string | number | boolean | null>) => deps.audit({ adminId, action: `admin.skippie_card_${decision === "approve" ? "approved" : "denied"}`, outcome, cardId: id.slice(0, 64), metadata });
    const card = typeof id === "string" ? cards.get(id) : undefined;
    if (!card || card.adminId !== adminId) { auditD("denied", { reason: "unknown card" }); return { ok: false, state: "unknown", message: "This card does not exist." }; }
    if (card.state !== "pending") { auditD("denied", { reason: `already ${card.state}`, action: card.params.action }); return { ok: false, state: card.state, message: `This card was already ${card.state}. Cards are one-use.` }; }
    if (deps.now() > card.expiresAtMs) { card.state = "expired"; auditD("denied", { reason: "expired", action: card.params.action }); return { ok: false, state: "expired", message: "This card expired. Ask Skippy again." }; }
    // Mark used BEFORE running so a double click or retry can never run it twice.
    if (decision === "deny") { card.state = "denied"; auditD("success", { action: card.params.action, ran: false }); return { ok: true, state: "denied", message: "Denied. Nothing was done." }; }
    card.state = "approved";
    const p = card.params;
    try {
      if (p.action === "rerun_job") {
        const job = deps.jobs.find(j => j.name === p.job);
        const last = job ? await deps.latestRun(job.name) : undefined;
        if (!job || !last || last.status !== "failed" || last.windowKey !== p.windowKey || deps.currentWindowKey(job, deps.now()) !== p.windowKey) {
          auditD("denied", { reason: "state changed since proposal", action: p.action, job: p.job, ran: false });
          return { ok: false, state: "approved", message: "The job changed since this card was made, so nothing ran. Ask Skippy again." };
        }
        const r = await deps.rerun(job);
        auditD(r.outcome === "ran" ? "success" : "failure", { action: p.action, job: p.job, windowKey: p.windowKey, outcome: r.outcome, processed: r.processed, failed: r.failed, ran: true });
        return { ok: r.outcome === "ran", state: "approved", message: `Ran ${p.job}: ${r.outcome} (processed ${r.processed}, failed ${r.failed}).` };
      }
      if (p.action === "open_linear_issue") {
        if (!deps.createLinearIssue) {
          auditD("success", { action: p.action, mode: "draft_only", ran: false });
          return { ok: true, state: "approved", message: "Linear is not connected to this app, so no issue was created. Here is the draft.", output: `Title: ${p.title}\n\n${p.body}` };
        }
        const issue = await deps.createLinearIssue(p.title, p.body);
        auditD("success", { action: p.action, mode: "created", url: issue.url, ran: true });
        return { ok: true, state: "approved", message: `Opened the Linear issue: ${issue.url}` };
      }
      const text = `## ${p.title}\n\n### What changed\n${p.notes || "(no notes given)"}\n\n### How it was tested\n- [ ] Not verified yet. Add the test output and screenshots before merge.\n\n### Risk and rollback\n- Feature flag stays OFF in prod until proved.\n`;
      auditD("success", { action: p.action, mode: "draft_only", ran: false });
      return { ok: true, state: "approved", message: "Draft ready. It was not posted anywhere.", output: text };
    } catch {
      auditD("failure", { action: p.action, ran: false, reason: "action threw" });
      return { ok: false, state: "approved", message: "The action failed. Nothing further was done." };
    }
  }
  return { propose, decide, _size: () => cards.size };
}
export type CardStore = ReturnType<typeof createCardStore>;
