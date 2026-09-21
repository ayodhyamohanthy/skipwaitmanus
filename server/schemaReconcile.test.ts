import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIRED_COLUMNS, DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";
const sqlText=(q:unknown)=>((q as {queryChunks?:Array<{value?:string[]}>}).queryChunks??[]).flatMap(c=>c.value??[]).join("");
async function load(rows:object[],foreignKeys:object[]){
 const calls:string[]=[];
 vi.resetModules();
 vi.doMock("./db",()=>({getDb:async()=>({execute:async(q:unknown)=>{const text=sqlText(q);calls.push(text);return [text.includes("KEY_COLUMN_USAGE")?foreignKeys:rows,[]]}})}));
 return {module:await import("./schemaReconcile"),calls};
}
function validRows(){return [
 ...DESIRED_COLUMNS.map(x=>({TABLE_NAME:x.table,COLUMN_NAME:x.column,INDEX_NAME:null,NON_UNIQUE:null})),
 ...DESIRED_TABLES.map(x=>({TABLE_NAME:x.table,COLUMN_NAME:"id",INDEX_NAME:null,NON_UNIQUE:null})),
 ...DESIRED_INDEXES.map(x=>({TABLE_NAME:x.table,COLUMN_NAME:null,INDEX_NAME:x.name,NON_UNIQUE:x.nonUnique?1:0})),
]}
const validFks=[
 {TABLE_NAME:"referralAttachments",COLUMN_NAME:"uploadSessionId",CONSTRAINT_NAME:"referral_attachments_upload_session_fk",REFERENCED_TABLE_NAME:"resumeUploadSessions",REFERENCED_COLUMN_NAME:"id"},
 {TABLE_NAME:"resumeUploadChunks",COLUMN_NAME:"acceptedAttemptId",CONSTRAINT_NAME:"resume_upload_chunks_accepted_attempt_fk",REFERENCED_TABLE_NAME:"resumeUploadAttempts",REFERENCED_COLUMN_NAME:"id"},
];
afterEach(()=>vi.restoreAllMocks());
describe("read-only schema validation",()=>{
 it("accepts the migrated schema using SELECT only",async()=>{const{module,calls}=await load(validRows(),validFks);await module.reconcileSchema();expect(module.isSchemaReconciled()).toBe(true);expect(calls).toHaveLength(2);expect(calls.every(x=>x.trimStart().startsWith("SELECT"))).toBe(true)});
 it("accepts Azure MySQL lowercase table identifiers",async()=>{const rows=validRows().map((row:any)=>({...row,TABLE_NAME:row.TABLE_NAME.toLowerCase()}));const fks=validFks.map(row=>({...row,TABLE_NAME:row.TABLE_NAME.toLowerCase(),REFERENCED_TABLE_NAME:row.REFERENCED_TABLE_NAME.toLowerCase()}));const{module,calls}=await load(rows,fks);await module.reconcileSchema();expect(module.isSchemaReconciled()).toBe(true);expect(module.getLastReconcileResults().every(result=>result.ok)).toBe(true);expect(calls.every(x=>x.trimStart().startsWith("SELECT"))).toBe(true)});
 it("reports a missing or nonunique index without DDL",async()=>{const rows=validRows().filter((x:any)=>x.INDEX_NAME!=="referral_attachments_upload_session_unique");const{module,calls}=await load(rows,validFks);await module.reconcileSchema();expect(module.isSchemaReconciled()).toBe(false);expect(module.getLastReconcileResults()).toContainEqual({statement:"index:referralAttachments.referral_attachments_upload_session_unique",ok:false,errorCode:"SCHEMA_MISMATCH"});expect(calls.join(" ")).not.toMatch(/ALTER|CREATE|DROP|UPDATE|DELETE|INSERT/i)});
 it("requires both 0050 foreign keys without mutating them",async()=>{const{module,calls}=await load(validRows(),validFks.slice(0,1));await module.reconcileSchema();expect(module.isSchemaReconciled()).toBe(false);expect(module.getLastReconcileResults()).toContainEqual({statement:"fk:resumeUploadChunks.acceptedAttemptId",ok:false,errorCode:"SCHEMA_MISMATCH"});expect(calls).toHaveLength(2)});
});
describe("schema recovery loop",()=>{
 it("retries transient validation failure until ready with SELECT-only traffic",async()=>{
  const calls:string[]=[];
  vi.resetModules();
  let attempts=0;
  vi.doMock("./db",()=>{
   return {
    getDb: async ()=>{
     attempts+=1;
     if(attempts===1)throw new Error("transient db offline");
     return {
      execute: async (q:unknown)=>{
       const text=sqlText(q);
       calls.push(text);
       return [text.includes("KEY_COLUMN_USAGE")?validFks:validRows(),[]];
      },
     };
    },
   };
  });
  const module=await import("./schemaReconcile");
  try{
   module.startSchemaReconcileRecovery({baseDelayMs:10,maxDelayMs:20});
   const deadline=Date.now()+2000;
   while(!module.isSchemaReconciled()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
   expect(module.isSchemaReconciled()).toBe(true);
   expect(attempts).toBeGreaterThanOrEqual(2);
   expect(calls.length).toBeGreaterThan(0);
   expect(calls.every(x=>x.trimStart().startsWith("SELECT"))).toBe(true);
  }finally{module.stopSchemaReconcileRecovery();}
 });
});
