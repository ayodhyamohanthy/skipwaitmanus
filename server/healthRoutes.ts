import type{Express}from"express";
export type HealthDeps={commitSha:()=>Promise<string>;isReady:()=>boolean;lastError:()=>string|null|undefined;dbPing?:()=>Promise<void>};
export function registerHealthRoutes(app:Express,deps:HealthDeps){
 const common=async()=>({service:"skipwait-api",commitSha:await deps.commitSha()});
 app.get("/api/health/live",async(_req,res)=>res.set("Cache-Control","no-store").status(200).json({ok:true,state:"live",...await common()}));
 app.get("/api/health/ready",async(_req,res)=>{const ready=deps.isReady(),failed=!ready&&Boolean(deps.lastError());res.set("Cache-Control","no-store").status(ready?200:503).json({ok:ready,state:ready?"ready":failed?"failed":"validating",...await common()})});
 // Diagnostic only: DB round trip from this container (ms, best of 3, cached 30 s so it cannot be used to hammer the DB). Never affects readiness.
 let latencyCache:{at:number;body:Record<string,unknown>}|null=null;
 app.get("/api/health/latency",async(_req,res)=>{
  res.set("Cache-Control","no-store");
  if(!deps.dbPing)return res.status(200).json({ok:true,dbRoundTripMs:null});
  if(latencyCache&&Date.now()-latencyCache.at<30_000)return res.status(200).json(latencyCache.body);
  const samples:number[]=[];
  try{for(let i=0;i<3;i++){const t=Date.now();await Promise.race([deps.dbPing(),new Promise<never>((_,rej)=>setTimeout(()=>rej(new Error("timeout")),3000))]);samples.push(Date.now()-t)}}catch{}
  const body={ok:true,dbRoundTripMs:samples.length?Math.min(...samples):null,samplesMs:samples};
  latencyCache={at:Date.now(),body};
  res.status(200).json(body);
 });
 app.get("/api/health",async(_req,res)=>{const ready=deps.isReady();res.set("Cache-Control","no-store").status(200).json({ok:true,...await common(),schemaReconciled:ready,schemaReconcileState:ready?"ready":deps.lastError()?"failed":"validating"})});
}
