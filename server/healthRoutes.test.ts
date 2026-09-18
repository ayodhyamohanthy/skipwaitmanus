import express from"express";import request from"supertest";import{describe,expect,it}from"vitest";import{registerHealthRoutes}from"./healthRoutes";
const appFor=(state:{ready:boolean;error?:string})=>{const app=express();registerHealthRoutes(app,{commitSha:async()=>"abc123",isReady:()=>state.ready,lastError:()=>state.error});return app};
describe("health planes",()=>{
 it("liveness is process-only",async()=>{const r=await request(appFor({ready:false,error:"private"})).get("/api/health/live");expect(r.status).toBe(200);expect(r.body).toEqual({ok:true,state:"live",service:"skipwait-api",commitSha:"abc123"})});
 it("readiness is opaque and never triggers schema work",async()=>{const r=await request(appFor({ready:false,error:"CREATE INDEX secret_table"})).get("/api/health/ready");expect(r.status).toBe(503);expect(r.body).toEqual({ok:false,state:"failed",service:"skipwait-api",commitSha:"abc123"});expect(JSON.stringify(r.body)).not.toMatch(/CREATE|INDEX|secret_table|http|mysql/i)});
 it("high-rate probes stay read-only",async()=>{const app=appFor({ready:false});const rs=await Promise.all(Array.from({length:20},()=>request(app).get("/api/health/ready")));expect(rs.every(r=>r.status===503&&r.body.state==="validating")).toBe(true)});
 it("reports ready",async()=>{const r=await request(appFor({ready:true})).get("/api/health/ready");expect(r.status).toBe(200);expect(r.body.state).toBe("ready")});
});
