// Private candidate, not published. No network or production credentials.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const roster='drizzle/deploy/0063_clerk_roster_import.sql';
const expected='3d75e958aa4ba913a8b0536b1ccf5ffee60d80df';
const companions=new Set(['.github/workflows/deploy-api.yml','scripts/classify-source-retirement.mjs','scripts/classifySourceRetirement.test.ts','.github/workflows/drift-watch.yml','scripts/driftWatch.test.ts','scripts/requireGreenRelease.test.ts']);
export function classify({cwd, before, head, event, approvedBlob=expected}) {
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if (!/^[a-f0-9]{40}$/.test(head??'')) throw Error('Unverifiable head');
 if(event==='workflow_dispatch') {
   // No source-only exemption for manual dispatch of the cleanup commit.
   const parent=git('rev-parse',head+'^');
   const touched=git('diff','--name-only','--no-renames',parent,head).split('\n');
   if(touched.includes(roster)) throw Error('Retirement cannot be manually dispatched');
   return 'normal';
 }
 if(event!=='push'||!/^[a-f0-9]{40}$/.test(before??'')||/^0+$/.test(before)) throw Error('Unverifiable push');
 git('cat-file','-e',before+'^{commit}');git('cat-file','-e',head+'^{commit}');
 const records=execFileSync('git',['diff','--name-status','--no-renames','-z',before,head],{cwd,encoding:'utf8'}).split('\0');
 records.pop(); const changes=[];
 if(records.length%2)throw Error('Unverifiable diff');
 for(let i=0;i<records.length;i+=2)changes.push([records[i],records[i+1]]);
 const entry=changes.find(([,p])=>p===roster);
 if(!entry)return 'normal';
 if(entry[0]!=='D'||git('rev-parse',before+':'+roster)!==approvedBlob)throw Error('Retirement must delete exact approved blob');
 for(const [status,path]of changes)if(path!==roster&&(!companions.has(path)||!['A','M'].includes(status)))throw Error('Mixed or unsupported cleanup delta');
 if(git('ls-tree','--name-only',head,'--',roster))throw Error('Retired file still present');
 return 'source-only';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log('mode='+classify({cwd:process.cwd(),before:process.env.BEFORE_SHA,head:process.env.HEAD_SHA,event:process.env.EVENT_NAME}));}
 catch{console.error('Source-retirement preflight refused unverified or mixed delta');process.exitCode=1;}
}
