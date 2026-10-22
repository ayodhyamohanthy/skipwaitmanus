import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { canAccessReferralAttachment } from "./db";
import { registerDbDocumentRoute } from "./_core/storageProxy";
describe("document access lifecycle",()=>{
 it("allows owner and the assigned referrer once accepted, denies a pending claimant and former/terminal referrer",()=>{expect(canAccessReferralAttachment(1,{ownerId:1})).toBe(true);expect(canAccessReferralAttachment(2,{ownerId:1,referrerId:2,requestStatus:"pending"})).toBe(false);expect(canAccessReferralAttachment(2,{ownerId:1,referrerId:2,requestStatus:"approved"})).toBe(true);expect(canAccessReferralAttachment(2,{ownerId:1,referrerId:2,requestStatus:"closed"})).toBe(false);expect(canAccessReferralAttachment(2,{ownerId:1,referrerId:2,requestStatus:"declined"})).toBe(false);expect(canAccessReferralAttachment(2,{ownerId:1,referrerId:3,requestStatus:"approved"})).toBe(false);expect(canAccessReferralAttachment(2,{ownerId:1,referrerId:2,requestStatus:"withdrawn"})).toBe(false);});
 it("never redeems raw DB storage keys",async()=>{const app=express();registerDbDocumentRoute(app,{resolveIdentity:async()=>({account:{id:1}})});const response=await request(app).get("/api/documents/by-key/private%2Fresume.pdf");expect(response.status).toBe(404);expect(response.headers["cache-control"]).toBe("private, no-store");});
});
