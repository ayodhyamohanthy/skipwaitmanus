import type { Express, Request } from "express";
import { refuseReviewerExternalAction } from "./_core/reviewerLogin";
import { z } from "zod";
import { companyClaimEnabled, CompanyClaimError, confirmCompanyClaim, loadCompanyClaimDashboard, sendCompanyClaimLink } from "./companyClaim";
type Deps = {
  enabled?: () => boolean;
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
  send?: typeof sendCompanyClaimLink;
  confirm?: typeof confirmCompanyClaim;
  dashboard?: typeof loadCompanyClaimDashboard;
};
const emailBody = z.object({ email: z.string().email().max(320) }).strict();
const tokenBody = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export function registerCompanyClaimRoutes(app: Express, deps: Deps) {
  // Feature gate before auth/DB, every response private and non-cacheable.
  app.use("/api/company-claim", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (!(deps.enabled ?? companyClaimEnabled)()) return res.status(404).json({ error: "Not found" });
    next();
  });
  const route = (action: (userId: number, req: Request) => Promise<unknown>) => async (req: Request, res: import("express").Response) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to verify your company" });
      if (refuseReviewerExternalAction(res, (identity.account as { openId?: string }).openId)) return;
      res.json(await action(identity.account.id, req));
    } catch (error) {
      if (error instanceof CompanyClaimError) return res.status(error.status).json({ error: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Check the verification details and try again" });
      console.error("[CompanyClaim]", error);
      res.status(503).json({ error: "Company verification is unavailable right now" });
    }
  };
  app.post("/api/company-claim/send", route((id, req) => (deps.send ?? sendCompanyClaimLink)(id, emailBody.parse(req.body).email)));
  app.post("/api/company-claim/confirm", route((id, req) => (deps.confirm ?? confirmCompanyClaim)(id, tokenBody.parse(req.body).token)));
  app.get("/api/company-claim/dashboard/:slug", route((id, req) => {
    const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).parse(req.params.slug);
    return (deps.dashboard ?? loadCompanyClaimDashboard)(id, slug);
  }));
}
