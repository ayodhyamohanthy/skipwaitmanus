import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPaymentRoutes } from "./payments";

const build = (signedIn=true) => {
  const app=express(); app.use(express.json()); const records: unknown[]=[];
  registerPaymentRoutes(app,{resolveIdentity:async()=>signedIn?{account:{id:7}}:undefined,planPricing:()=>({inrAmount:99,usdAmount:2}),record:async x=>{records.push(x)}});
  return {app,records};
};
describe("direct consumer checkout safety gate",()=>{
  it.each(["razorpay","paypal"])("never creates a payable %s orphan",async provider=>{
    const fetchSpy=vi.spyOn(globalThis,"fetch"); const {app,records}=build();
    const response=await request(app).post(`/api/payments/${provider}/order`).send({planId:"pro",tokens:999});
    expect(response.status).toBe(503); expect(response.body.error).toContain("Chargebee"); expect(fetchSpy).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    fetchSpy.mockRestore();
  });
  it("still requires identity before naming the canonical rail",async()=>{const {app}=build(false);expect((await request(app).post("/api/payments/razorpay/order")).status).toBe(401)});
});
