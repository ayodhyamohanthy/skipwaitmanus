const VERSION='skipwait-shell-v1';
const SHELL=['/','/offline','/manifest.webmanifest','/skipwait-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));return response}).catch(async()=>await caches.match(event.request)||await caches.match('/offline')));
  else if(url.pathname.startsWith('/assets/')||url.pathname==='/skipwait-icon.svg')event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));return response})));
});
