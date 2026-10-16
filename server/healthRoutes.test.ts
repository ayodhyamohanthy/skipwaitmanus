import express from"express";import request from"supertest";import{describe,expect,it}from"vitest";import{registerHealthRoutes}from"./healthRoutes";
const appFor=(state:{ready:boolean;error?:string})=>{const app=express();registerHealthRoutes(app,{commitSha:async()=>"abc123",isReady:()=>state.ready,lastError:()=>state.error});return app};
describe("health planes",()=>{
 it("liveness is process-only",async()=>{const r=await request(appFor({ready:false,error:"private"})).get("/api/health/live");expect(r.status).toBe(200);expect(r.body).toEqual({ok:true,state:"live",service:"skipwait-api",commitSha:"abc123"})});
 it("readiness is opaque and never triggers schema work",async()=>{const r=await request(appFor({ready:false,error:"CREATE INDEX secret_table"})).get("/api/health/ready");expect(r.status).toBe(503);expect(r.body).toEqual({ok:false,state:"failed",service:"skipwait-api",commitSha:"abc123"});expect(JSON.stringify(r.body)).not.toMatch(/CREATE|INDEX|secret_table|http|mysql/i)});
 it("high-rate probes stay read-only",async()=>{const app=appFor({ready:false});const rs=await Promise.all(Array.from({length:20},()=>request(app).get("/api/health/ready")));expect(rs.every(r=>r.status===503&&r.body.state==="validating")).toBe(true)});
 it("reports ready",async()=>{const r=await request(appFor({ready:true})).get("/api/health/ready");expect(r.status).toBe(200);expect(r.body.state).toBe("ready")});
 it("latency is diagnostic: best of 3 round trips, cached, null when the DB fails, never touches readiness",async()=>{
  let calls=0;const app=express();registerHealthRoutes(app,{commitSha:async()=>"abc",isReady:()=>false,lastError:()=>undefined,dbPing:async()=>{calls++}});
  const a=await request(app).get("/api/health/latency");expect(a.status).toBe(200);expect(typeof a.body.dbRoundTripMs).toBe("number");expect(a.body.samplesMs).toHaveLength(3);
  await request(app).get("/api/health/latency");expect(calls).toBe(3);
  const bad=express();registerHealthRoutes(bad,{commitSha:async()=>"abc",isReady:()=>true,lastError:()=>undefined,dbPing:async()=>{throw new Error("mysql://secret")}});
  const b=await request(bad).get("/api/health/latency");expect(b.status).toBe(200);expect(b.body.dbRoundTripMs).toBeNull();expect(JSON.stringify(b.body)).not.toMatch(/mysql|secret/);
 });
});
