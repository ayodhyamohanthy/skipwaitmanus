import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as ai from "./ai";
import * as db from "./db";

const profileInput = z.object({ accountType: z.enum(["job_seeker", "referrer"]), headline: z.string().max(180).optional(), location: z.string().max(120).optional(), bio: z.string().max(4000).optional(), company: z.string().max(160).optional(), currentTitle: z.string().max(160).optional(), resumeUrl: z.string().url().optional().or(z.literal("")), skills: z.string().max(4000).optional(), experience: z.string().max(8000).optional(), expertise: z.string().max(4000).optional(), referralCapacity: z.number().int().min(0).max(20).optional() });
export const appRouter = router({
  system: systemRouter,
  auth: router({ me: publicProcedure.query(opts => opts.ctx.user), logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }) }),
  profile: router({ mine: protectedProcedure.query(({ ctx }) => db.getProfileByUserId(ctx.user.id)), save: protectedProcedure.input(profileInput).mutation(({ ctx, input }) => db.saveProfile(ctx.user.id, input)) }),
  jobs: router({ list: publicProcedure.input(z.object({ query: z.string().optional(), company: z.string().optional(), location: z.string().optional(), seniority: z.string().optional() }).optional()).query(({ input }) => db.listJobs(input ?? {})) }),
  community: router({ listReferrers: publicProcedure.input(z.object({ query: z.string().optional(), company: z.string().optional(), role: z.string().optional() }).optional()).query(({ input }) => db.listReferrers(input ?? {})) }),
  savedRoles: router({ list: protectedProcedure.query(({ ctx }) => db.listSavedRoles(ctx.user.id)), toggle: protectedProcedure.input(z.object({ jobId: z.number().int().positive() })).mutation(({ ctx, input }) => db.toggleSavedRole(ctx.user.id, input.jobId)) }),
  referrals: router({ listMine: protectedProcedure.query(({ ctx }) => db.listReferralRequests(ctx.user.id)), create: protectedProcedure.input(z.object({ jobId: z.number().int().positive(), referrerId: z.number().int().positive(), personalPitch: z.string().min(20).max(600) })).mutation(({ ctx, input }) => db.createReferralRequest(ctx.user.id, input)), review: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), decision: z.enum(["approved", "declined"]), message: z.string().max(1000).optional() })).mutation(({ ctx, input }) => db.reviewReferralRequest(ctx.user.id, input)), stats: protectedProcedure.query(({ ctx }) => db.getDashboardStats(ctx.user.id)) }),
  messaging: router({ list: protectedProcedure.query(({ ctx }) => db.listMessages(ctx.user.id)), send: protectedProcedure.input(z.object({ recipientId: z.number().int().positive(), body: z.string().min(1).max(4000), referralRequestId: z.number().int().positive().optional() })).mutation(({ ctx, input }) => db.sendMessage(ctx.user.id, input)) }),
  notifications: router({ list: protectedProcedure.query(({ ctx }) => db.listNotifications(ctx.user.id)), markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(({ ctx, input }) => db.markNotificationRead(ctx.user.id, input.notificationId)) }),
  ai: router({
    copilot: protectedProcedure.input(z.object({ message: z.string().min(1).max(2000) })).mutation(async ({ ctx, input }) => ({ reply: await ai.runCareerCopilot({ message: input.message, context: await db.getAiWorkspaceContext(ctx.user.id) }) })),
    briefing: protectedProcedure.query(async ({ ctx }) => ai.createProactiveBrief({ context: await db.getAiWorkspaceContext(ctx.user.id) })),
    matchReferrers: protectedProcedure.input(z.object({ jobTitle: z.string().min(1), company: z.string().min(1) })).mutation(async ({ ctx, input }) => ai.matchReferrers({ ...input, context: await db.getAiWorkspaceContext(ctx.user.id) })),
    draftReferralPitch: protectedProcedure.input(z.object({ jobTitle: z.string().min(1), company: z.string().min(1), referrerName: z.string().min(1), notes: z.string().min(1).max(2000) })).mutation(async ({ ctx, input }) => ({ draft: await ai.draftReferralPitch({ ...input, profile: await db.getProfileByUserId(ctx.user.id) }) })),
    referralFit: protectedProcedure.input(z.object({ candidateName: z.string().min(1), jobTitle: z.string().min(1), company: z.string().min(1), personalPitch: z.string().min(1).max(4000) })).mutation(({ input }) => ai.summarizeReferralFit(input)),
  }),
});
export type AppRouter = typeof appRouter;
