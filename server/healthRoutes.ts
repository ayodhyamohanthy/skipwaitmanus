import type{Express}from"express";
import { healthJobsResponseSchema, type HealthJobsResponse } from "../shared/scheduledJobs";
import { createMysqlJobRunStore, type JobRunStore } from "./jobRunStore";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import type { JobCapture, ScheduledJobDefinition } from "./scheduledJobRunner";
import { isJobOverdue, JOBS_PROCESS_START_MS } from "./scheduledJobsRoutes";
import { captureServerError } from "./sentry";
export type HealthDeps={commitSha:()=>Promise<string>;isReady:()=>boolean;lastError:()=>string|null|undefined;dbPing?:()=>Promise<number|void>;now?:()=>number;processStartMs?:number;jobs?:readonly ScheduledJobDefinition[];jobStore?:Pick<JobRunStore,"latest">;capture?:JobCapture};
export const JOBS_HEALTH_READ_TIMEOUT_MS = 3_000;
export function registerHealthRoutes(app:Express,deps:HealthDeps){
 const common=async()=>({service:"skipwait-api",commitSha:await deps.commitSha()});
 const now = deps.now ?? Date.now;
 const processStartMs = deps.processStartMs ?? JOBS_PROCESS_START_MS;
 const jobs = deps.jobs ?? SCHEDULED_JOBS;
 const jobStore = deps.jobStore ?? createMysqlJobRunStore();
 const capture = deps.capture ?? captureServerError;
 let jobsCache: { at: number; body: HealthJobsResponse } | null = null;
 let jobsInFlight: Promise<HealthJobsResponse> | null = null;
 const readJobs = async (): Promise<HealthJobsResponse> => {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
   const nowMs = now();
   const statuses = await Promise.race([
    Promise.all(jobs.map(async job => {
     const row = await jobStore.latest(job.name, "succeeded");
     return { name: job.name, overdue: isJobOverdue(job, row ? row.finishedAt ?? row.startedAt : null, nowMs, processStartMs) };
    })),
    new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new Error("Scheduled job health read timed out")), JOBS_HEALTH_READ_TIMEOUT_MS); }),
   ]);
   return healthJobsResponseSchema.parse({ ok: statuses.every(job => !job.overdue), jobs: statuses });
  } catch (error) {
   capture(error, { path: "/api/health/jobs" });
   return { ok: false, jobs: jobs.map(job => ({ name: job.name, overdue: true })) };
  } finally {
   clearTimeout(deadline);
  }
 };
 app.get("/api/health/jobs", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (jobsCache && now() - jobsCache.at < 60_000) return res.status(200).json(jobsCache.body);
  jobsInFlight ??= readJobs().then(body => {
   jobsCache = { at: now(), body };
   return body;
  }).finally(() => { jobsInFlight = null; });
  res.status(200).json(await jobsInFlight);
 });
 app.get("/api/health/live",async(_req,res)=>res.set("Cache-Control","no-store").status(200).json({ok:true,state:"live",...await common()}));
 app.get("/api/health/ready",async(_req,res)=>{const ready=deps.isReady(),failed=!ready&&Boolean(deps.lastError());res.set("Cache-Control","no-store").status(ready?200:503).json({ok:ready,state:ready?"ready":failed?"failed":"validating",...await common()})});
 // Diagnostic only: DB round trip from this container (ms, best of 3, cached 30 s so it cannot be used to hammer the DB). Never affects readiness.
 let latencyCache:{at:number;body:Record<string,unknown>}|null=null;
 app.get("/api/health/latency",async(_req,res)=>{
  res.set("Cache-Control","no-store");
  if(!deps.dbPing)return res.status(200).json({ok:true,dbRoundTripMs:null});
  if(latencyCache&&Date.now()-latencyCache.at<30_000)return res.status(200).json(latencyCache.body);
  const samples:number[]=[];let lowerCaseTableNames:number|null=null;
  try{for(let i=0;i<3;i++){const t=Date.now();const v=await Promise.race([deps.dbPing(),new Promise<never>((_,rej)=>setTimeout(()=>rej(new Error("timeout")),3000))]);samples.push(Date.now()-t);if(typeof v==="number")lowerCaseTableNames=v}}catch{}
  const body={ok:true,dbRoundTripMs:samples.length?Math.min(...samples):null,samplesMs:samples,lowerCaseTableNames};
  latencyCache={at:Date.now(),body};
  res.status(200).json(body);
 });
 app.get("/api/health",async(_req,res)=>{const ready=deps.isReady();res.set("Cache-Control","no-store").status(200).json({ok:true,...await common(),schemaReconciled:ready,schemaReconcileState:ready?"ready":deps.lastError()?"failed":"validating"})});
}
