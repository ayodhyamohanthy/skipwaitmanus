import type { Express, Request } from "express";
import { razorpayConfigured, razorpayOrderInPaise, type ActivityInput } from "./payments";
import { UNLOCK_CREDIT_PACKS, type UnlockCreditPackId } from "./db";

/**
 * B2B self-serve employer surface: account, unlock-credit purchases, anonymized
 * talent discovery, sponsored roles, and the contextual partner-module slots.
 * Employer identity = profiles.accountType === "employer"; admins (users.role)
 * may end sponsorships early. All deps are injected for DI-style testing.
 */

export type EmployerIdentity = { account: { id: number; openId: string; role?: "user" | "admin" }; primaryEmail?: { emailAddress?: string | null } | null };

export type EmployerRouteDeps = {
  resolveIdentity: (req: Request) => Promise<EmployerIdentity | undefined>;
  recordActivity?: (input: ActivityInput) => Promise<void>;
  isEmployer: (userId: number) => Promise<boolean>;
  ensureEmployerAccount: (userId: number, companyName: string, billingEmail: string) => Promise<unknown>;
  getEmployerAccount: (userId: number) => Promise<unknown>;
  listAnonymizedSeekerProfiles: (employerUserId: number, input: { query?: string; location?: string }) => Promise<unknown[]>;
  resolveEmployerTalentRef: (employerUserId: number, displayRef: string) => Promise<number | undefined>;
  spendEmployerUnlockCredit: (employerUserId: number, seekerUserId: number) => Promise<{ ok: boolean; reason?: string; remaining?: number; credits?: number; alreadyUnlocked?: boolean }>;
  getUnlockedProfile: (employerUserId: number, seekerUserId: number) => Promise<unknown>;
  requestEmployerTalentIntro: (employerUserId: number, seekerUserId: number) => Promise<{ ok: boolean; reason?: string; created?: boolean }>;
  createNotification?: (userId: number, category: "referral" | "message" | "status" | "system", title: string, body: string) => Promise<void>;
  sponsorCompanyOpportunity: (userId: number, opportunityId: number, input: { tier: "featured" | "spotlight"; isAdmin?: boolean }) => Promise<unknown>;
  endCompanyOpportunitySponsorship: (adminUserId: number, opportunityId: number) => Promise<unknown>;
  listSponsoredCompanyOpportunities: (limit?: number) => Promise<unknown[]>;
  listEmployerOpportunities: (userId: number) => Promise<unknown[]>;
  listPartnerModules: (input: { category?: PartnerCategory; roleKeywords?: string[]; limit?: number }) => Promise<unknown[]>;
  recordPartnerImpression: (moduleId: number) => Promise<void>;
  recordPartnerClick: (moduleId: number) => Promise<{ recorded: boolean }>;
  createPartnerModule?: (input: { partnerName: string; category: PartnerCategory; headline: string; description?: string; targetRoles?: string; ctaLabel: string; ctaUrl: string }) => Promise<unknown>;
  updatePartnerModule?: (moduleId: number, patch: PartnerModulePatch) => Promise<unknown>;
  listAllPartnerModules?: () => Promise<unknown[]>;
  listEmployerSpendHistory: (userId: number, limit?: number) => Promise<unknown[]>;
  recordUnlockCreditOrderIntent?: (input: { orderId: string; userId: number; pack: UnlockCreditPackId; amount: number; currency: string }) => Promise<unknown>;
  createRazorpayUnlockOrder?: (input: { amountInPaise: number; receipt: string; notes: Record<string, string> }) => Promise<{ id: string; amount: number; currency: string }>;
  unlockCreditPacks?: typeof UNLOCK_CREDIT_PACKS;
};

const PARTNER_CATEGORIES = ["interview_prep", "resume_vetting", "skill_assessment", "other"] as const;
type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

const isPartnerCategory = (value: unknown): value is PartnerCategory => PARTNER_CATEGORIES.includes(value as PartnerCategory);
const isUnlockPack = (value: unknown): value is UnlockCreditPackId => value === "starter" || value === "growth" || value === "scale";
const roleKeywordsFrom = (value: unknown) => (typeof value === "string" ? value.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean).slice(0, 12) : []);

type GateError = { status: 401 | 403; body: { error: string } };
type Gate = { error: GateError } | { identity: EmployerIdentity };
type PartnerModulePatch = { partnerName?: string; category?: PartnerCategory; headline?: string; description?: string | null; targetRoles?: string | null; ctaLabel?: string; ctaUrl?: string; isActive?: boolean };

export function registerEmployerRoutes(app: Express, deps: EmployerRouteDeps) {
  const record = (input: ActivityInput) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const requireIdentity = async (req: Request): Promise<Gate> => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) return { error: { status: 401, body: { error: "Sign in to use the employer tools" } } };
    return { identity };
  };
  // Employer access is keyed on profiles.accountType === "employer" (self-serve
  // paid role). Admins pass only where explicitly allowed below.
  const requireEmployer = async (req: Request): Promise<Gate> => {
    const gate = await requireIdentity(req);
    if ("error" in gate) return gate;
    if (!(await deps.isEmployer(gate.identity.account.id))) return { error: { status: 403, body: { error: "Employer access is required" } } };
    return { identity: gate.identity };
  };
  const requireAdmin = async (req: Request): Promise<Gate> => {
    const gate = await requireIdentity(req);
    if ("error" in gate) return gate;
    if (gate.identity.account.role !== "admin") return { error: { status: 403, body: { error: "Administrator access is required" } } };
    return { identity: gate.identity };
  };

  app.post("/api/employer/account", async (req, res) => {
    try {
      const gate = await requireIdentity(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim() : "";
      const verifiedEmail = gate.identity.primaryEmail?.emailAddress?.trim().toLowerCase() ?? "";
      const billingEmail = typeof req.body?.billingEmail === "string" ? req.body.billingEmail.trim().toLowerCase() : verifiedEmail;
      if (!verifiedEmail || billingEmail !== verifiedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(billingEmail)) return res.status(400).json({ error: "Use your verified sign-in email for employer review" });
      if (!companyName || companyName.length < 2) return res.status(400).json({ error: "Add your company name for employer review" });
      const account = await deps.ensureEmployerAccount(gate.identity.account.id, companyName, billingEmail);
      record({ actorUserId: gate.identity.account.id, action: "employer.account_created", outcome: "success", resourceType: "employer_account" });
      res.status(201).json({ account });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not open your employer account" }); }
  });

  app.get("/api/employer/account", async (req, res) => {
    try {
      const gate = await requireIdentity(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const account = await deps.getEmployerAccount(gate.identity.account.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ account: account ?? null });
    } catch { res.status(500).json({ error: "We could not load your employer account" }); }
  });

  app.post("/api/employer/unlock-credits/purchase", async (req, res) => {
    try {
      const gate = await requireEmployer(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const pack = req.body?.pack;
      if (!isUnlockPack(pack)) return res.status(400).json({ error: "Choose the starter, growth, or scale credit pack" });
      const packs = deps.unlockCreditPacks ?? UNLOCK_CREDIT_PACKS;
      const selected = packs[pack];
      const createOrder = deps.createRazorpayUnlockOrder ?? (razorpayConfigured() ? razorpayOrderInPaise : undefined);
      if (!createOrder) return res.status(503).json({ error: "Razorpay is not configured" });
      const order = await createOrder({ amountInPaise: selected.amountInPaise, receipt: `employer_${gate.identity.account.id}_${Date.now()}`, notes: { userId: String(gate.identity.account.id), kind: "unlock_credits", pack } });
      if (!deps.recordUnlockCreditOrderIntent) throw new Error("Payment fulfillment storage is unavailable");
      await deps.recordUnlockCreditOrderIntent({ orderId: order.id, userId: gate.identity.account.id, pack, amount: order.amount, currency: order.currency });
      record({ actorUserId: gate.identity.account.id, action: "employer.unlock_credits_order_created", outcome: "success", resourceType: "payment", resourceId: order.id, metadata: { pack, amountInPaise: selected.amountInPaise, credits: selected.credits } });
      res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, pack, credits: selected.credits });
    } catch (error) {
      console.warn("[Employer] unlock-credit order error:", error);
      res.status(502).json({ error: "We could not start the Razorpay checkout. Try again shortly." });
    }
  });

  app.get("/api/employer/talent", async (req, res) => {
    try {
      const gate = await requireEmployer(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const query = typeof req.query.query === "string" ? req.query.query.slice(0, 120) : undefined;
      const location = typeof req.query.location === "string" ? req.query.location.slice(0, 120) : undefined;
      const talent = await deps.listAnonymizedSeekerProfiles(gate.identity.account.id, { query, location });
      record({ actorUserId: gate.identity.account.id, action: "employer.talent_searched", outcome: "success", resourceType: "talent_search", metadata: { resultCount: talent.length, filtered: Boolean(query || location) } });
      res.set("Cache-Control", "private, no-store");
      res.json({ talent });
    } catch { res.status(500).json({ error: "We could not load the talent list" }); }
  });

  app.post("/api/employer/talent/:displayRef/unlock", async (req, res) => {
    try {
      const gate = await requireEmployer(req); if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const displayRef = req.params.displayRef; const seekerUserId = await deps.resolveEmployerTalentRef(gate.identity.account.id, displayRef);
      if (!seekerUserId) return res.status(404).json({ error: "Talent profile not found" });
      const result = await deps.spendEmployerUnlockCredit(gate.identity.account.id, seekerUserId);
      if (!result.ok) { if (result.reason === "insufficient_credits") return res.status(402).json({ error: "Not enough unlock credits", credits: result.credits ?? 0 }); return res.status(409).json({ error: "Open an employer account before unlocking talent" }); }
      record({ actorUserId: gate.identity.account.id, action: "employer.talent_unlocked", outcome: "success", resourceType: "profile_unlock", resourceId: displayRef, metadata: { remainingCredits: result.remaining } });
      if (!result.alreadyUnlocked) await deps.createNotification?.(seekerUserId, "referral", "An employer unlocked your profile", "An employer on skipwait.me unlocked your anonymized profile. You stay in control of contact requests.");
      res.status(result.alreadyUnlocked ? 200 : 201).json({ unlocked: true, remaining: result.remaining });
    } catch { res.status(500).json({ error: "We could not unlock this profile" }); }
  });

  app.get("/api/employer/talent/:displayRef", async (req, res) => {
    try {
      const gate = await requireEmployer(req); if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const seekerUserId = await deps.resolveEmployerTalentRef(gate.identity.account.id, req.params.displayRef);
      if (!seekerUserId) return res.status(404).json({ error: "Talent profile not found" });
      const profile = await deps.getUnlockedProfile(gate.identity.account.id, seekerUserId);
      if (!profile) return res.status(402).json({ error: "Unlock this profile with credits before viewing it" });
      res.set("Cache-Control", "private, no-store"); res.json({ profile });
    } catch { res.status(500).json({ error: "We could not load this profile" }); }
  });

  app.post("/api/employer/talent/:displayRef/intro", async (req, res) => {
    try {
      const gate = await requireEmployer(req); if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const displayRef = req.params.displayRef; const seekerUserId = await deps.resolveEmployerTalentRef(gate.identity.account.id, displayRef);
      if (!seekerUserId) return res.status(404).json({ error: "Talent profile not found" });
      const result = await deps.requestEmployerTalentIntro(gate.identity.account.id, seekerUserId);
      if (!result.ok) return res.status(409).json({ error: "Unlock this profile before requesting an intro" });
      if (result.created) await deps.createNotification?.(seekerUserId, "referral", "An employer requested an introduction", "An employer on skipwait.me requested an introduction. You choose whether to respond.");
      res.status(result.created ? 201 : 200).json({ requested: true });
    } catch { res.status(500).json({ error: "We could not send the intro request" }); }
  });

  app.post("/api/employer/opportunities/:opportunityId/sponsor", async (req, res) => {
    try {
      const gate = await requireEmployer(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const opportunityId = Number(req.params.opportunityId);
      const tier = req.body?.tier;
      if (!Number.isInteger(opportunityId) || opportunityId <= 0) return res.status(400).json({ error: "Invalid opportunity reference" });
      if (tier !== "featured" && tier !== "spotlight") return res.status(400).json({ error: "Choose a featured or spotlight sponsorship tier" });
      const sponsorship = await deps.sponsorCompanyOpportunity(gate.identity.account.id, opportunityId, { tier });
      res.status(201).json({ sponsorship });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not sponsor this role";
      res.status(/owner or an administrator|employer account|not currently|could not be found|tier/i.test(message) ? 400 : 402).json({ error: message });
    }
  });

  app.get("/api/employer/opportunities", async (req, res) => {
    try {
      const gate = await requireEmployer(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      res.set("Cache-Control", "private, no-store");
      res.json({ opportunities: await deps.listEmployerOpportunities(gate.identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your opportunities" }); }
  });

  app.get("/api/employer/spend-history", async (req, res) => {
    try {
      const gate = await requireEmployer(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      res.set("Cache-Control", "private, no-store");
      res.json({ spend: await deps.listEmployerSpendHistory(gate.identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your spend history" }); }
  });

  // Public contextual partner modules: seeker feeds pass role words; the GET
  // itself records an impression batch for the returned slots.
  app.get("/api/partners", async (req, res) => {
    try {
      const role = typeof req.query.role === "string" ? req.query.role : "";
      const category = isPartnerCategory(req.query.category) ? req.query.category : undefined;
      const modules = await deps.listPartnerModules({ roleKeywords: roleKeywordsFrom(role), category, limit: 3 });
      for (const module of modules as Array<{ id?: number }>) if (typeof module.id === "number") await deps.recordPartnerImpression(module.id);
      res.set("Cache-Control", "public, max-age=60");
      res.json({ modules });
    } catch { res.status(500).json({ error: "We could not load partner recommendations" }); }
  });

  app.post("/api/partners/:moduleId/click", async (req, res) => {
    try {
      const moduleId = Number(req.params.moduleId);
      if (!Number.isInteger(moduleId) || moduleId <= 0) return res.status(400).json({ error: "Invalid partner reference" });
      const result = await deps.recordPartnerClick(moduleId);
      if (!result.recorded) return res.status(404).json({ error: "Partner module not found" });
      res.json({ recorded: true });
    } catch { res.status(500).json({ error: "We could not record that click" }); }
  });

  // Admin partner inventory management.
  app.get("/api/admin/partners", async (req, res) => {
    try {
      const gate = await requireAdmin(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      res.json({ modules: await deps.listAllPartnerModules?.() ?? [] });
    } catch { res.status(500).json({ error: "We could not load partner modules" }); }
  });

  app.post("/api/admin/partners", async (req, res) => {
    try {
      const gate = await requireAdmin(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const body = req.body ?? {};
      if (!isPartnerCategory(body.category)) return res.status(400).json({ error: "Choose a partner category" });
      if (typeof body.partnerName !== "string" || !body.partnerName.trim() || typeof body.headline !== "string" || !body.headline.trim() || typeof body.ctaLabel !== "string" || !body.ctaLabel.trim() || typeof body.ctaUrl !== "string" || !body.ctaUrl.trim()) return res.status(400).json({ error: "Partner name, headline, CTA label, and CTA URL are required" });
      const created = await deps.createPartnerModule?.({ partnerName: body.partnerName, category: body.category, headline: body.headline, description: typeof body.description === "string" ? body.description : undefined, targetRoles: typeof body.targetRoles === "string" ? body.targetRoles : undefined, ctaLabel: body.ctaLabel, ctaUrl: body.ctaUrl });
      record({ actorUserId: gate.identity.account.id, action: "admin.partner_module_created", outcome: "success", resourceType: "partner_module", metadata: { category: body.category } });
      res.status(201).json({ module: created });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not create the partner module" }); }
  });

  app.patch("/api/admin/partners/:moduleId", async (req, res) => {
    try {
      const gate = await requireAdmin(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const moduleId = Number(req.params.moduleId);
      if (!Number.isInteger(moduleId) || moduleId <= 0) return res.status(400).json({ error: "Invalid partner reference" });
      const body = req.body ?? {};
      if (body.category !== undefined && !isPartnerCategory(body.category)) return res.status(400).json({ error: "Choose a partner category" });
      const updated = await deps.updatePartnerModule?.(moduleId, body);
      record({ actorUserId: gate.identity.account.id, action: "admin.partner_module_updated", outcome: "success", resourceType: "partner_module", resourceId: moduleId });
      res.json({ module: updated });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "We could not update the partner module" }); }
  });

  // Sponsored posts are self-serve (auto-approved), so admin review is just the
  // audit + early termination lever.
  app.get("/api/admin/sponsorships", async (req, res) => {
    try {
      const gate = await requireAdmin(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      res.json({ sponsorships: await deps.listSponsoredCompanyOpportunities() });
    } catch { res.status(500).json({ error: "We could not load active sponsorships" }); }
  });

  app.post("/api/admin/opportunities/:opportunityId/end-sponsorship", async (req, res) => {
    try {
      const gate = await requireAdmin(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const opportunityId = Number(req.params.opportunityId);
      if (!Number.isInteger(opportunityId) || opportunityId <= 0) return res.status(400).json({ error: "Invalid opportunity reference" });
      const result = await deps.endCompanyOpportunitySponsorship(gate.identity.account.id, opportunityId);
      record({ actorUserId: gate.identity.account.id, action: "admin.sponsorship_ended", outcome: "success", resourceType: "opportunity", resourceId: opportunityId });
      res.json({ sponsorship: result });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "We could not end this sponsorship" }); }
  });
}
