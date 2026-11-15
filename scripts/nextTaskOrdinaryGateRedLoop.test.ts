import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";
const NOW=Date.parse("2026-11-09T14:00:00Z"),HEAD="a".repeat(40);
const task={id:"T",title:"ordinary Tier1",row:"T",packet:null,tier:1,lane:"t",branch:"agent/queue/t",status:"todo",dependsOn:[],owns:["server/t.ts"]};
const pick=(last:string,age:number,gateOnly=true,claimant="Fresh · f1",ciExtra:Record<string,unknown>={},reports:unknown[]=[])=>pickNextTask({tasks:[task],mainCi:{state:"green"},branches:new Map([[task.branch,{tipMs:NOW-3*3600000,tipSha:HEAD,merged:false,markers:[{verb:"Claim",id:"T",who:"Builder · b1"}]}],["agent/review/t",{tipMs:NOW-age,merged:false,markers:[{verb:"Review claim",id:"T",who:"Reviewer · r1"},...(last==="Review claim"?[]:[{verb:"Verdict",id:"T",who:"Reviewer · r1",verdict:last}])]}]]),openPrs:new Map([[task.branch,"https://example.test/pr/867"]]),prCi:new Map([[task.branch,{state:"red",sha:HEAD,gateOnly,...ciExtra}]]),mergedHeads:new Map(),reports,now:NOW,claimant,register:null} as never);
describe("ordinary Tier1 gate-only-red does not reclaim zero-delta FIX",()=>{
 it("active passed review waits for exact-head CI reevaluation instead of a source FIX",()=>{expect(pick("pass",1000).kind).not.toBe("fix")});
 it("active review waits for its reviewer instead of an empty FIX",()=>{expect(pick("Review claim",1000).kind).not.toBe("fix")});
 it("quiet passed review returns qualified REVIEW, never source FIX or LAND",()=>{expect(pick("pass",3*3600000).kind).toBe("review")});
 it("builder and fixer model exclusions remain on quiet review recovery",()=>{expect(pick("pass",3*3600000,true,"Builder · other").kind).not.toBe("review")});
 it("wrong-head gate evidence does not trigger the recovery",()=>{expect(pick("pass",3*3600000,true,"Fresh · f1",{sha:"b".repeat(40)}).kind).not.toBe("review")});
 it("unknown CI never becomes review recovery or landing",()=>{const kind=pick("pass",3*3600000,true,"Fresh · f1",{state:"unknown"}).kind;expect(kind).not.toBe("review");expect(kind).not.toBe("land")});
 it("standing block is not cleared by gate-only recovery",()=>{expect(pick("pass",3*3600000,true,"Fresh · f1",{},[{id:"T",status:"blocked",who:"Other · z",at:NOW-1000,note:"actual provider acceptance missing"}]).kind).not.toBe("review")});
 it("real review findings still route to FIX",()=>{expect(pick("findings",3*3600000).kind).toBe("fix")});
 it("mixed CI red after a pass still routes to FIX",()=>{expect(pick("pass",3*3600000,false).kind).toBe("fix")});
});
