// Ask drafts REST surface (queue task 11). Owner-only: the user comes from the
// session. A draft is never sent and never touches credits; /ask reads it to
// prefill and clears it. Contract in shared/askDraft.ts.
//   GET    /api/ask-drafts   the caller's draft or { draft: null }
//   PUT    /api/ask-drafts   save (replace) the caller's draft
//   DELETE /api/ask-drafts   discard it
import express, { type Express, type Request } from "express";
import { askDraftInputSchema, type AskDraft } from "../shared/askDraft";
import { deleteAskDraft, getAskDraft, saveAskDraft } from "./askDrafts";

type Identity = { account: { id: number } };

export type AskDraftRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string }) => void | Promise<void>;
  getAskDraft?: (userId: number) => Promise<AskDraft | null>;
  saveAskDraft?: typeof saveAskDraft;
  deleteAskDraft?: (userId: number) => Promise<void>;
};

export function registerAskDraftRoutes(app: Express, deps: AskDraftRouteDeps) {
  const read = deps.getAskDraft ?? getAskDraft;
  const write = deps.saveAskDraft ?? saveAskDraft;
  const remove = deps.deleteAskDraft ?? deleteAskDraft;
  const record = (action: string, actorUserId: number) => { void deps.recordActivity?.({ actorUserId, action, outcome: "success", resourceType: "ask_draft" }); };

  app.get("/api/ask-drafts", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to continue your draft" });
      res.set("Cache-Control", "private, no-store").json({ draft: await read(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your draft" }); }
  });

  app.put("/api/ask-drafts", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to save your draft" });
      const parsed = askDraftInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: "Check the job link and note, then try again" });
      const draft = await write(identity.account.id, parsed.data);
      record("ask_draft.saved", identity.account.id);
      res.set("Cache-Control", "private, no-store").json({ draft });
    } catch { res.status(500).json({ error: "We could not save your draft" }); }
  });

  app.delete("/api/ask-drafts", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to discard your draft" });
      await remove(identity.account.id);
      record("ask_draft.discarded", identity.account.id);
      res.set("Cache-Control", "private, no-store").json({ draft: null });
    } catch { res.status(500).json({ error: "We could not discard your draft" }); }
  });
}
