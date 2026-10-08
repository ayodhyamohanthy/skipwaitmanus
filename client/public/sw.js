const VERSION='skipwait-shell-__SW_BUILD__';
const BUILD_ASSETS=[]/*__SW_ASSETS__*/;
const SHELL=['/offline','/manifest.webmanifest','/skipwait-icon.svg','/skipwait-icon-192.png','/skipwait-icon-512.png','/skipwait-icon-maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL.concat(BUILD_ASSETS).map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request,{cache:'no-store'}).catch(async()=>url.pathname==='/offline'?await caches.match('/offline'):Response.redirect('/offline?from='+encodeURIComponent(url.pathname+url.search),302)));
  else if(url.pathname==='/manifest.webmanifest')event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));
  else if(url.pathname.startsWith('/assets/')||['/skipwait-icon.svg','/skipwait-icon-192.png','/skipwait-icon-512.png','/skipwait-icon-maskable-512.png'].includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(event.request,copy));return response})));
});
