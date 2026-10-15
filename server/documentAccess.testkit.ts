/*
 * Test-only fixtures for the D-019(e) document-access tests: one ask at
 * acme.com with the seeker's resume, the people around it, and the real
 * private-referral routes wired to the real store (server/db.ts) over the
 * in-memory drizzle client. Tests install the client with
 * vi.mock("drizzle-orm/mysql2", ...) and reseed with `resetStore`.
 */
import express from "express";
import { jobs, profiles, referralAttachments, referralDocumentAccessGrants, referralRequestPasses, referralRequests, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { claimCompanyReferralRequest, getAccessibleReferralAttachment, getClaimedCompanyReferralDetail, oneClickReviewReferralRequest, reviewReferralRequest } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

export const SEEKER = 7;
/** The verified acme.com employee who claims and/or accepts in each test. */
export const REFERRER = 2;
/** Another verified acme.com employee: same company, never assigned the ask. */
export const COLLEAGUE = 4;
/** A verified employee of another company. */
export const OUTSIDER = 3;
export const REQUEST_ID = 501;
export const RESUME_ID = 77;
export const NOTE = "I led a measurable product design launch.";

export type AskSeed = { status?: string; referrerId?: number | null; revision?: number };

/** One ask (pending and unclaimed unless overridden), the seeker's resume on it, and the seeker's wallet with the ask's debit. */
export function seedRows(options: { ask?: AskSeed; grants?: readonly Row[]; passedBy?: readonly number[]; extraAttachments?: readonly Row[] } = {}) {
  const verifiedAt = new Date("2026-09-01T00:00:00Z");
  const employee = (id: number, userId: number, domain: string): Row => ({ id, userId, accountType: "referrer", workEmailDomain: domain, workEmailVerifiedAt: verifiedAt });
  return [
    [users, [{ id: SEEKER, name: "Avery Example" }, { id: REFERRER, name: "Riya Referrer" }, { id: COLLEAGUE, name: "Colin Colleague" }, { id: OUTSIDER, name: "Other Person" }]],
    [profiles, [employee(31, REFERRER, "acme.com"), employee(32, OUTSIDER, "other.com"), employee(33, COLLEAGUE, "acme.com")]],
    [jobs, [{ id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", jobFunction: null }]],
    [referralRequests, [{ id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: options.ask?.referrerId ?? null, status: options.ask?.status ?? "pending", revision: options.ask?.revision ?? 3, personalPitch: NOTE, referrerMessage: null, debitTransactionId: 61, createdAt: new Date() }]],
    [referralAttachments, [...(options.extraAttachments ?? []), { id: RESUME_ID, ownerId: SEEKER, referralRequestId: REQUEST_ID, fileName: "Avery-Example-Resume.pdf", fileKey: "private/avery.pdf", mimeType: "application/pdf", fileSize: 2048 }]],
    [referralDocumentAccessGrants, [...(options.grants ?? [])]],
    [referralRequestPasses, (options.passedBy ?? []).map((referrerId, index): Row => ({ id: 70 + index, referralRequestId: REQUEST_ID, referrerId, reason: "timing" }))],
    [tokenBalances, [{ id: 81, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free" }]],
    [tokenTransactions, [{ id: 61, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "direct_request", source: "monthly_allowance", sourceCycleKey: "2026-10", reversesTransactionId: null }]],
  ] as const;
}

/** A grant row as a claim wrote it before D-019(e). */
export function claimEraGrant(expiresAt: Date, referrerId = REFERRER): Row {
  return { id: 9, referralRequestId: REQUEST_ID, referrerId, requestRevision: 4, grantVersion: 1, grantedAt: new Date(expiresAt.getTime() - 30 * 24 * 60 * 60 * 1000), expiresAt, revokedAt: null, revokeReason: null };
}

export const store = createInMemoryDrizzle();
export const resetStore = (options?: Parameters<typeof seedRows>[0]) => store.reset(seedRows(options));

type RequiredDepName = { [K in keyof PrivateReferralRouteDeps]-?: undefined extends PrivateReferralRouteDeps[K] ? never : K }[keyof PrivateReferralRouteDeps];
const unusedDep = (name: RequiredDepName) => (): never => { throw new Error(`document access testkit: the route reached ${name}, which these tests do not provide`); };

/** The real routes over the real store; `x-test-user` picks the signed-in person. No email or notification is sent. */
export function documentAccessApp() {
  const server = express();
  server.use(express.json());
  const people = new Set([SEEKER, REFERRER, COLLEAGUE, OUTSIDER]);
  registerPrivateReferralRoutes(server, {
    dataUrlToBuffer: unusedDep("dataUrlToBuffer"), sanitizeDocumentName: unusedDep("sanitizeDocumentName"), storagePut: unusedDep("storagePut"),
    createReferralAttachment: unusedDep("createReferralAttachment"), saveVerifiedWorkEmail: unusedDep("saveVerifiedWorkEmail"),
    createCompanyReferralRequest: unusedDep("createCompanyReferralRequest"), listCompanyReferralInbox: unusedDep("listCompanyReferralInbox"),
    listPublicCompanyOpportunities: unusedDep("listPublicCompanyOpportunities"), publishCompanyOpportunity: unusedDep("publishCompanyOpportunity"),
    resolveIdentity: async req => { const id = Number(req.header("x-test-user")); return people.has(id) ? { account: { id, openId: `user-${id}` } } : undefined; },
    getBlockedReferralRequestIds: async () => new Set<number>(),
    storageGetSignedUrl: async key => `https://signed.example/${key}`,
    getAccessibleReferralAttachment, claimCompanyReferralRequest, getClaimedCompanyReferralDetail, oneClickReviewReferralRequest, reviewReferralRequest,
  });
  return server;
}
