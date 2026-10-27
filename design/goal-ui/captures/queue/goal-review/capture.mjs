import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/\/$/, '');
const require = createRequire(`${root}/package.json`);
const { chromium } = require('playwright');
const fixture = JSON.parse((await readFile(`${root}/design/goal-ui/tools/fixtures/queue__with-data.json`, 'utf8')).replaceAll('wipro.com', 'quillmint.example').replaceAll('Wipro', 'Quillmint').replaceAll('Rao Verma', 'Quiet Falcon'));
fixture.routes.push({ method: 'GET', path: '/api/referrer/home', body: { home: { routing: { state: 'active' } } } }, { method: 'GET', path: '/api/referrer-preferences', body: { preferences: { notifyNewAsk: false } } });
const output = `${root}/design/goal-ui/captures/queue/goal-review`;
await mkdir(output, {recursive:true});
await writeFile(`${output}/fixture.json`, JSON.stringify(fixture,null,2)+'\n');
const browser = await chromium.launch({ headless: true });
const report = [];
try {
 for (const width of [1280,390]) {
  for (const state of ['list','selected','preview-error','decision-error','pass-dialog','empty-quiet']) {
   const page = await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/trpc/')) {
     const names=url.pathname.slice('/api/trpc/'.length).split(',');
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(names.map(name=>({result:{data:{json:name==='auth.me'?{openId:'fixture',loginMethod:'fixture',role:'user',...fixture.signedIn}:null}}})))});
    }
    if(url.pathname.includes('one-click-review')) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'We could not save your decision. Try again.'})});
    if(state==='preview-error' && url.pathname.endsWith('/preview')) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Preview unavailable'})});
    let hit=fixture.routes.find(r=>r.method===route.request().method()&&(r.match==='prefix'?url.pathname.startsWith(r.path):r.path===url.pathname));
    let body=hit?.body ?? {};
    if(url.pathname.includes('/inbox') && (url.searchParams.get('scope')==='saved'||state==='empty-quiet')) body={requests:[]};
    return route.fulfill({status:hit?.status??200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await page.addInitScript(()=>localStorage.setItem('skipwait:cookie-consent','all'));
   await page.goto(`http://localhost:3012/queue${!['list','empty-quiet'].includes(state)?'?request=7':''}`,{waitUntil:'networkidle'});
   await page.getByRole('heading',{name:'Help the right person get referred.'}).waitFor();
   if(state==='list') await page.getByRole('button',{name:'Read next ask'}).waitFor();
   if(state==='empty-quiet') await page.getByText('No asks right now.').waitFor();
   if(state==='preview-error') await page.getByRole('button',{name:'Try preview again'}).waitFor();
   if(['selected','decision-error','pass-dialog'].includes(state)) {
    const accept=page.getByRole('button',{name:/Accept & connect/});
    await accept.waitFor();
    await page.waitForFunction(()=>document.querySelector('[aria-keyshortcuts="a"]')?.getAttribute('aria-disabled')!=='true');
    if(state==='decision-error') {await accept.click();await page.getByRole('alert').filter({hasText:'We could not save your decision'}).waitFor();}
    if(state==='pass-dialog') {
     await page.getByRole('button',{name:/Pass privately/}).click();
     await page.keyboard.press('j');
     assert.equal(await page.locator('#ask-role').textContent(),'Product Designer');
     await page.keyboard.press('k');
     assert.equal(await page.locator('#ask-role').textContent(),'Product Designer');
    }
   }
   const primaries=await page.locator('[data-g-primary]').count();
   assert(primaries<=1,`${state}: ${primaries} primary actions`);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert(overflow<=0,`${width} ${state}: ${overflow}px overflow`);
   assert.equal(errors.length,0,errors.join(';'));
   await page.evaluate(()=>document.fonts.ready);
   const path=`${output}/${state}-${width}.png`;
   await page.screenshot({path,fullPage:true});
   report.push({state,width,primaries,overflow,pageErrors:errors,path});
   console.log(`Captured ${state} ${width}: primary=${primaries}, overflow=${overflow}, errors=${errors.length}`);
   await page.close();
  }
 }
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
} finally {await browser.close();}
