const VERSION='foundation-1';
const PREFIX='adventure-ai-shell:'+self.registration.scope;
const CACHE=PREFIX+VERSION;
const ASSETS=['./','index.html','app.css','app.js','gpx.js','storage.js','manifest.webmanifest','assets/install-icon.png','assets/install-icon-512.png','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css','vendor/leaflet/images/layers.png','vendor/leaflet/images/layers-2x.png','vendor/leaflet/images/marker-icon.png','vendor/leaflet/images/marker-icon-2x.png','vendor/leaflet/images/marker-shadow.png'];
const urls=ASSETS.map(x=>new URL(x,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);try{await cache.addAll(urls);}catch(error){await caches.delete(CACHE);throw error;}})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(!urls.includes(url.href))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const response=await cache.match(event.request);return response||new Response('App shell incomplete. Reconnect and reinstall/update.',{status:503,headers:{'Content-Type':'text/plain'}});})());});
