// REBUILT 2026-10-31 (not identical restoration). Anonymous /plans at 1280 and 390. Read-only, no clicks.
const {chromium}=require('playwright-core');
(async()=>{let b,ok=true;try{b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const w of [1280,390]){const c=await b.newContext({viewport:{width:w,height:900}});const p=await c.newPage();const pe=[];p.on('pageerror',e=>pe.push(String(e).slice(0,80)));
const r=await p.goto('https://skipwait.me/plans',{waitUntil:'load'});await p.waitForTimeout(5000);
const body=await p.innerText('body');const n=(body.match(/Not on sale yet/g)||[]).length;const sw=await p.evaluate(()=>document.documentElement.scrollWidth);
const fp=new URL(p.url()).pathname;const good=r.status()==200&&fp=='/plans'&&pe.length==0&&n==4&&sw<=w;if(!good)ok=false;
await p.screenshot({path:`/downloads/packs-${w}.png`});
console.log(JSON.stringify({w,status:r.status(),finalPath:fp,pageerrors:pe.length,notOnSale:n,sw,good}));await c.close()}
}catch(e){ok=false;console.log('FATAL',String(e).slice(0,100))}finally{if(b)await b.close()}
console.log(JSON.stringify({pass:ok}));process.exit(ok?0:1)})()
