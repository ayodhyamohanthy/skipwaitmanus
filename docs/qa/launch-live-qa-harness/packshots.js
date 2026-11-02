// Scrolls to the credit-pack section and saves screenshots to /downloads for visual inspection.
const {chromium}=require('playwright-core');(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
for(const w of [1280,390]){const c=await b.newContext({viewport:{width:w,height:900}});const p=await c.newPage();await p.goto('https://skipwait.me/plans',{waitUntil:'load'});await p.waitForTimeout(5000);
console.log(w,'buttons',await p.getByText('Not on sale yet').count());
// scroll the pack heading to the top of the viewport using its page offset (works at any width)
const y=await p.evaluate(()=>{const h=[...document.querySelectorAll('h1,h2,h3')].find(e=>/Add credits that never expire/.test(e.textContent));return h?Math.max(0,h.getBoundingClientRect().top+window.scrollY-40):0});
await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(600);
const n=w==1280?1:3;
for(let i=0;i<n;i++){await p.screenshot({path:`/downloads/packs-sec-${w}-${i}.png`});await p.evaluate(()=>window.scrollBy(0,780));await p.waitForTimeout(400)}
console.log(w,'scrolled to y',y);await c.close()}await b.close()})()
