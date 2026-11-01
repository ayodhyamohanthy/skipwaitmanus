import {it} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,unlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {classify} from './classify-source-retirement.mjs';
it('finite source retirement synthetic Git controls',()=>{
const cwd=mkdtempSync(join(tmpdir(),'safe-retirement-'));
const git=(...a)=>execFileSync('git',a,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let count=0;const pass=(s,f)=>{f();count++;console.log('PASS '+s)};
try{
 git('init','-q');git('config','user.name','Synthetic Fixture');git('config','user.email','fixture@example.invalid');
 const file='drizzle/deploy/0063_clerk_roster_import.sql';mkdirSync(join(cwd,'drizzle/deploy'),{recursive:true});writeFileSync(join(cwd,file),'-- synthetic fixture only\nSELECT 1;\n');
 git('add','.');git('commit','-qm','synthetic baseline');const before=git('rev-parse','HEAD'),approvedBlob=git('rev-parse',before+':'+file);
 const call=(head,more={})=>classify({cwd,before,head,event:'push',approvedBlob,...more});
 pass('unchanged ordinary push normal',()=>assert.equal(call(before),'normal'));
 unlinkSync(join(cwd,file));git('add','-A');git('commit','-qm','retire synthetic import');const head=git('rev-parse','HEAD');
 pass('exact approved deletion source-only',()=>assert.equal(call(head),'source-only'));
 pass('production default rejects synthetic blob',()=>assert.throws(()=>classify({cwd,before,head,event:'push'})));
 pass('manual cleanup dispatch blocked',()=>assert.throws(()=>call(head,{event:'workflow_dispatch'})));
 pass('wrong original blob blocked',()=>assert.throws(()=>call(head,{approvedBlob:'0'.repeat(40)})));
 pass('unknown event blocked',()=>assert.throws(()=>call(head,{event:'pull_request'})));
 pass('zero before blocked',()=>assert.throws(()=>call(head,{before:'0'.repeat(40)})));
 pass('missing before blocked',()=>assert.throws(()=>call(head,{before:undefined})));
 pass('unavailable before blocked',()=>assert.throws(()=>call(head,{before:'1'.repeat(40)})));
 pass('invalid head blocked',()=>assert.throws(()=>call('HEAD')));
 mkdirSync(join(cwd,'scripts'));writeFileSync(join(cwd,'scripts/classify-source-retirement.mjs'),'// synthetic\n');git('add','.');git('commit','-qm','finite companion');
 pass('approved companion allowed',()=>assert.equal(call(git('rev-parse','HEAD')),'source-only'));
 mkdirSync(join(cwd,'server'));writeFileSync(join(cwd,'server/db.ts'),'// runtime\n');git('add','.');git('commit','-qm','mixed runtime');
 pass('mixed aggregate runtime blocked',()=>assert.throws(()=>call(git('rev-parse','HEAD'))));
 git('checkout','-q',head);writeFileSync(join(cwd,'drizzle/deploy/0121_other.sql'),'SELECT 2;');git('add','.');git('commit','-qm','mixed migration');
 pass('extra migration blocked',()=>assert.throws(()=>call(git('rev-parse','HEAD'))));
 git('checkout','-q',before);writeFileSync(join(cwd,file),'-- edited, not deleted\n');git('add','.');git('commit','-qm','edit');
 pass('in-place redaction blocked',()=>assert.throws(()=>call(git('rev-parse','HEAD'))));
 git('checkout','-q',before);mkdirSync(join(cwd,'server'),{recursive:true});writeFileSync(join(cwd,'server/db.ts'),'// ordinary\n');git('add','.');git('commit','-qm','ordinary runtime');
 pass('ordinary runtime normal',()=>assert.equal(call(git('rev-parse','HEAD')),'normal'));
 pass('ordinary manual normal',()=>assert.equal(call(git('rev-parse','HEAD'),{event:'workflow_dispatch'}),'normal'));
 console.log(`${count}/${count} real Git synthetic controls passed. Candidate only, no workflow or production execution.`);
}finally{rmSync(cwd,{recursive:true,force:true})}

});
