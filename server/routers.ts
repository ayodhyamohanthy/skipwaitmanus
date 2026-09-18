import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as ai from "./ai";
import * as db from "./db";

const profileInput = z.object({ accountType: z.enum(["job_seeker", "referrer"]), headline: z.string().max(180).optional(), location: z.string().max(120).optional(), bio: z.string().max(4000).optional(), company: z.string().max(160).optional(), currentTitle: z.string().max(160).optional(), resumeUrl: z.string().url().optional().or(z.literal("")), skills: z.string().max(4000).optional(), experience: z.string().max(8000).optional(), expertise: z.string().max(4000).optional(), referralCapacity: z.number().int().min(0).max(20).optional() });
const retiredPrivateWorkflow = () => { throw new TRPCError({ code: "FORBIDDEN", message: "Use the private company referral flow for this action" }); };
const disabledReferralList = async (): Promise<Awaited<ReturnType<typeof db.listReferralRequests>>> => retiredPrivateWorkflow();
const disabledReferralCreate = async (): Promise<Awaited<ReturnType<typeof db.createReferralRequest>>> => retiredPrivateWorkflow();
const disabledReferralReview = async (): Promise<Awaited<ReturnType<typeof db.reviewReferralRequest>>> => retiredPrivateWorkflow();
const disabledReferralStats = async (): Promise<Awaited<ReturnType<typeof db.getDashboardStats>>> => retiredPrivateWorkflow();
const disabledMessageList = async (): Promise<Awaited<ReturnType<typeof db.listMessages>>> => retiredPrivateWorkflow();
const disabledMessageSend = async (): Promise<Awaited<ReturnType<typeof db.sendMessage>>> => retiredPrivateWorkflow();
export const appRouter = router({
  system: systemRouter,
  auth: router({ me: publicProcedure.query(opts => opts.ctx.user), logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }) }),
  profile: router({ mine: protectedProcedure.query(({ ctx }) => db.getProfileByUserId(ctx.user.id)), save: protectedProcedure.input(profileInput).mutation(({ ctx, input }) => db.saveProfile(ctx.user.id, input)) }),
  talentConsent: router({
    preview: protectedProcedure.query(() => db.getTalentConsentPreview()),
    state: protectedProcedure.query(({ ctx }) => db.getTalentConsentState(ctx.user.id)),
    grant: protectedProcedure.input(z.object({ policyVersion: z.string().max(32), disclosedFields: z.array(z.enum(["headline","location","skills","experience","expertise"])).min(1), source: z.string().min(1).max(80) })).mutation(({ ctx, input }) => db.grantTalentDiscoveryConsent(ctx.user.id, input)),
    revoke: protectedProcedure.input(z.object({ reason: z.string().max(255).optional() }).optional()).mutation(({ ctx, input }) => db.revokeTalentDiscoveryConsent(ctx.user.id, input?.reason)),
    accessHistory: protectedProcedure.query(({ ctx }) => db.listTalentAccessHistory(ctx.user.id)),
    revokeEmployer: protectedProcedure.input(z.object({ employerUserId: z.number().int().positive() })).mutation(({ ctx, input }) => db.revokeTalentEmployerAccess(ctx.user.id, input.employerUserId)),
  }),
  jobs: router({ list: publicProcedure.input(z.object({ query: z.string().optional(), company: z.string().optional(), location: z.string().optional(), seniority: z.string().optional() }).optional()).query(({ input }) => db.listJobs(input ?? {})) }),
  community: router({ listReferrers: protectedProcedure.input(z.object({ query: z.string().optional(), company: z.string().optional(), role: z.string().optional() }).optional()).query(({ input }) => db.listReferrers(input ?? {})) }),
  savedRoles: router({ list: protectedProcedure.query(({ ctx }) => db.listSavedRoles(ctx.user.id)), set: protectedProcedure.input(z.object({ jobId: z.number().int().positive(), saved: z.boolean() })).mutation(({ ctx, input }) => db.setSavedRole(ctx.user.id, input.jobId, input.saved)) }),
  referrals: router({ listMine: protectedProcedure.query(disabledReferralList), create: protectedProcedure.input(z.any()).mutation(disabledReferralCreate), review: protectedProcedure.input(z.any()).mutation(disabledReferralReview), stats: protectedProcedure.query(disabledReferralStats) }),
  messaging: router({ list: protectedProcedure.query(disabledMessageList), send: protectedProcedure.input(z.any()).mutation(disabledMessageSend) }),
  notifications: router({ list: protectedProcedure.query(({ ctx }) => db.listNotifications(ctx.user.id)), markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(({ ctx, input }) => db.markNotificationRead(ctx.user.id, input.notificationId)) }),
  ai: router({
    copilot: protectedProcedure.input(z.object({ message: z.string().min(1).max(2000) })).mutation(async ({ ctx, input }) => ({ reply: await ai.runCareerCopilot({ message: input.message, context: await db.getAiWorkspaceContext(ctx.user.id) }) })),
    briefing: protectedProcedure.query(async ({ ctx }) => ai.createProactiveBrief({ context: await db.getAiWorkspaceContext(ctx.user.id) })),
    matchReferrers: protectedProcedure.input(z.object({ jobTitle: z.string().min(1), company: z.string().min(1) })).mutation(async ({ ctx, input }) => ai.matchReferrers({ ...input, context: await db.getAiWorkspaceContext(ctx.user.id) })),
    draftReferralPitch: protectedProcedure.input(z.object({ jobTitle: z.string().min(1), company: z.string().min(1), referrerName: z.string().min(1), notes: z.string().min(1).max(2000) })).mutation(async ({ ctx, input }) => ({ draft: await ai.draftReferralPitch({ ...input, profile: await db.getProfileByUserId(ctx.user.id) }) })),
    draftHiringManagerEmail: protectedProcedure.input(z.object({ candidateName: z.string().min(1).max(120), targetRoleUrl: z.string().url().max(2048), accomplished: z.string().max(500).optional(), measuredBy: z.string().max(500).optional(), byDoing: z.string().max(500).optional() })).mutation(async ({ input }) => ({ draft: await ai.draftHiringManagerEmail(input) })),
    referralFit: protectedProcedure.input(z.object({ candidateName: z.string().min(1), jobTitle: z.string().min(1), company: z.string().min(1), personalPitch: z.string().min(1).max(4000) })).mutation(({ input }) => ai.summarizeReferralFit(input)),
  }),
});
export type AppRouter = typeof appRouter;
