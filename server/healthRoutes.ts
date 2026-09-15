import type{Express}from"express";
export type HealthDeps={commitSha:()=>Promise<string>;isReady:()=>boolean;lastError:()=>string|null|undefined;retry:()=>Promise<unknown>};
export function registerHealthRoutes(app:Express,deps:HealthDeps){
 const common=async()=>({service:"skipwait-api",commitSha:await deps.commitSha()});
 app.get("/api/health/live",async(_req,res)=>res.set("Cache-Control","no-store").status(200).json({ok:true,state:"live",...await common()}));
 app.get("/api/health/ready",async(_req,res)=>{const ready=deps.isReady(),failed=!ready&&Boolean(deps.lastError());if(!ready)void deps.retry().catch(()=>{});res.set("Cache-Control","no-store").status(ready?200:503).json({ok:ready,state:ready?"ready":failed?"failed":"reconciling",...await common()})});
 // Compatibility endpoint retained for deployment SHA consumers. New traffic
 // readiness checks must use /health/ready.
 app.get("/api/health",async(_req,res)=>{const ready=deps.isReady();if(!ready)void deps.retry().catch(()=>{});res.set("Cache-Control","no-store").status(200).json({ok:true,...await common(),schemaReconciled:ready,schemaReconcileState:ready?"ready":deps.lastError()?"failed":"reconciling"})});
}
