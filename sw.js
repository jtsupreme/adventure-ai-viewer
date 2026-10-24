'use strict';
const VERSION='foundation-9-location-40b';
const PREFIX='adventure-ai-shell:'+self.registration.scope;
const CACHE=PREFIX+VERSION;
const ASSETS=['./','index.html','app.css','app.js','gpx.js','storage.js','manifest.webmanifest','assets/install-icon.png','assets/install-icon-512.png','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css','vendor/leaflet/images/layers.png','vendor/leaflet/images/layers-2x.png','vendor/leaflet/images/marker-icon.png','vendor/leaflet/images/marker-icon-2x.png','vendor/leaflet/images/marker-shadow.png','terrain/index.html','terrain/app.js','terrain/style.css','terrain/catalog.json','terrain/pack-manifest.json'];
const url=path=>new URL(path,self.registration.scope).href;
const urls=ASSETS.map(url);
const terrainBase=new URL('terrain/',self.registration.scope).href;
const terrainURL=path=>new URL(path,terrainBase).href;
// Deliberately outside PREFIX: historical shell cleanup must never delete packs.
const TERRAIN_PREFIX='adventure-ai-regional:'+self.registration.scope+':';
const CONTROL=TERRAIN_PREFIX+'control-v1';
const ACTIVE=terrainURL('__active__'),READY=terrainURL('__ready__');
const guard=()=>{if(new URL(self.registration.scope).origin!==self.location.origin)throw Error('Scope origin mismatch');};
let terrainBusy=false;
const hex=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
function expectedAddresses(){const result=new Set();for(const [z,x0,x1,y0,y1] of [[10,278,282,398,400],[11,557,564,797,800],[12,1115,1128,1595,1600],[13,2231,2256,3191,3201]])for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)result.add(`tiles/${z}/${x}/${y}.png`);return result;}
async function manifest(){
 guard();const shell=await caches.open(CACHE);const catalogResponse=await shell.match(terrainURL('catalog.json'));const response=await shell.match(terrainURL('pack-manifest.json'));
 if(!catalogResponse||!response)throw new Error('Prototype shell metadata missing');
 const catalog=await catalogResponse.json();const bytes=await response.arrayBuffer();if(await hex(bytes)!==catalog.sha256)throw new Error('Manifest integrity failure');
 const m=JSON.parse(new TextDecoder().decode(bytes));const identity={...m};delete identity.pack_id;
 if(m.pack_id!==catalog.pack_id||m.pack_id!=='mrogers-D-regional-v1-'+(await hex(new TextEncoder().encode(canonical(identity)))).slice(0,24))throw new Error('Pack identity mismatch');
 const expected=expectedAddresses();if(m.tile_count!==417||m.tiles.length!==417||m.total_bytes>50*1024*1024)throw new Error('Unexpected pack capacity');
 let total=0;for(const tile of m.tiles){if(!expected.delete(tile.path)||tile.bytes<=0||tile.bytes>512*1024||!/^[a-f0-9]{64}$/.test(tile.sha256))throw new Error('Unexpected tile manifest');total+=tile.bytes;}
 if(expected.size||total!==m.total_bytes)throw new Error('Incomplete manifest');return m;
}
const packCache=m=>TERRAIN_PREFIX+'pack:'+m.pack_id;
async function verify(response,tile,decode=false){
 if(!response||!response.ok)throw new Error('Tile unavailable: '+tile.path);
 const bytes=await response.clone().arrayBuffer();if(bytes.byteLength!==tile.bytes||await hex(bytes)!==tile.sha256)throw new Error('Tile integrity failure: '+tile.path);
 const data=new DataView(bytes);if(data.getUint32(0)!==0x89504e47||data.getUint32(4)!==0x0d0a1a0a||data.getUint32(16)!==256||data.getUint32(20)!==256)throw new Error('Tile format mismatch');
 if(decode){if(typeof createImageBitmap!=='function')throw new Error('This browser lacks worker PNG decoding; terrain installation is unavailable');const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const valid=image.width===256&&image.height===256;image.close();if(!valid)throw new Error('Tile decode failure');}
}
async function status(){
 const m=await manifest();const name=packCache(m);const keys=await caches.keys();const control=await caches.open(CONTROL);const active=await control.match(ACTIVE);const pointer=active?await active.json():null;
 let count=0,ready=false;if(keys.includes(name)){const cache=await caches.open(name);for(const tile of m.tiles){try{await verify(await cache.match(terrainURL(tile.path)),tile);count++;}catch{}}
  const marker=await cache.match(READY);ready=count===417&&!!marker&&pointer?.pack_id===m.pack_id&&(await marker.json()).pack_id===m.pack_id;
 }
 return {pack_id:m.pack_id,ready,verified_tiles:count,total_tiles:417,bytes:m.total_bytes,staging:keys.includes(name)&&!ready};
}
async function install(){
 const m=await manifest();const existing=await status();if(existing.ready)return existing;
 if(navigator.storage?.estimate){const estimate=await navigator.storage.estimate();if(Number.isFinite(estimate.quota)&&Number.isFinite(estimate.usage)&&estimate.quota-estimate.usage<Math.max(2*m.total_bytes,m.total_bytes+64*1024*1024))throw new Error('Insufficient estimated headroom; existing data untouched');}
 const cache=await caches.open(packCache(m));await cache.delete(READY);
 let completed=0;
 async function progress(){completed++;if(completed%8===0||completed===417)for(const client of await self.clients.matchAll())client.postMessage({type:'PACK_PROGRESS',verified:completed,total:417});}
 for(const tile of m.tiles){let response=await cache.match(terrainURL(tile.path));try{await verify(response,tile,true);await progress();continue;}catch{await cache.delete(terrainURL(tile.path));}
  response=await fetch(terrainURL(tile.path),{cache:'no-store'});await verify(response,tile,true);await cache.put(terrainURL(tile.path),response);await progress();
 }
 // Full second verification before the ready marker and single active-pointer write.
 for(const tile of m.tiles)await verify(await cache.match(terrainURL(tile.path)),tile,true);
 await cache.put(READY,new Response(JSON.stringify({pack_id:m.pack_id,tile_count:417}),{headers:{'Content-Type':'application/json'}}));
 const control=await caches.open(CONTROL);await control.put(ACTIVE,new Response(JSON.stringify({pack_id:m.pack_id}),{headers:{'Content-Type':'application/json'}}));return status();
}
async function remove(stagingOnly){const m=await manifest();const state=await status();if(stagingOnly&&state.ready)throw new Error('Ready pack cannot be discarded as staging');await caches.delete(packCache(m));const control=await caches.open(CONTROL);const active=await control.match(ACTIVE);if(active&&(await active.json()).pack_id===m.pack_id)await control.delete(ACTIVE);return status();}
let queue=Promise.resolve();

self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);try{await cache.addAll(urls);await manifest();}catch(error){await caches.delete(CACHE);throw error;}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{
 const type=event.data?.type;
 const source=event.source;
 const trusted=source&&typeof source.url==='string'&&source.url.startsWith(self.registration.scope);
 if(type==='ACTIVATE'){
  if(!trusted)return;
  event.waitUntil((async()=>{
   let requestedClient=false,activated=false;
   try{
   // Activation would reload the unchanged historical page. Require a single window
   // and never interrupt a pack operation in the active worker or another client.
   const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   if(windows.length!==1||windows[0].id!==source.id||terrainBusy)return;
   const active=self.registration.active;
   if(active&&active.scriptURL!==self.location.href)return;
   // Ask the current controller whether an install is underway before replacing it.
   if(active&&active.state==='activated'){
    const idle=await new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(false);},2000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.idle===true);};active.postMessage({type:'TERRAIN_IDLE'},[channel.port2]);});
    if(!idle){
     // The protected foundation-5 worker predates the idle handshake and has no
     // terrain API. Permit that exact local cache lineage only before any unified
     // terrain cache exists; later unresponsive controllers fail closed.
     const keys=await caches.keys();
     if(!keys.includes(PREFIX+'foundation-5')||keys.some(k=>k.startsWith(TERRAIN_PREFIX)))return;
    }
   }
   // Ask the actual requesting document to reserve its GPX controls. A legacy
   // or unresponsive page cannot prove readiness, so forced activation defers.
   requestedClient=true;
   const clientReady=await new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(false);},2000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.ready===true);};source.postMessage({type:'UPDATE_READINESS'},[channel.port2]);});
   if(!clientReady)return;
   // The idle handshake is asynchronous. Fail closed if the requester closed
   // or another client appeared after the first snapshot.
   const finalWindows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   if(finalWindows.length!==1||finalWindows[0].id!==source.id)return;
   await self.skipWaiting();activated=true;
   }finally{if(requestedClient&&!activated){try{source.postMessage({type:'UPDATE_CANCEL'});}catch{/* Closed client has no reservation to release. */}}}
  })());return;
 }
 if(type==='TERRAIN_IDLE'&&event.ports?.[0]){event.ports[0].postMessage({idle:!terrainBusy});return;}
 if(!trusted||!event.ports?.[0]||!['TERRAIN_STATUS','TERRAIN_INSTALL','TERRAIN_DISCARD','TERRAIN_REMOVE'].includes(type))return;
 const task=queue.then(async()=>{terrainBusy=true;try{guard();return type==='TERRAIN_STATUS'?await status():type==='TERRAIN_INSTALL'?await install():await remove(type==='TERRAIN_DISCARD');}finally{terrainBusy=false;}});
 queue=task.catch(()=>{});event.waitUntil(task.then(data=>event.ports[0].postMessage({ok:true,data}),error=>event.ports[0].postMessage({ok:false,error:error.message})));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const requestURL=new URL(event.request.url);
 if(urls.includes(requestURL.href)){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(event.request)||new Response('App shell incomplete. Reconnect and update.',{status:503,headers:{'Content-Type':'text/plain'}});})());return;}
 if(requestURL.href.startsWith(terrainURL('tiles/')))event.respondWith((async()=>{try{
  guard();const m=await manifest();const tile=m.tiles.find(t=>terrainURL(t.path)===requestURL.href);if(!tile)throw Error('Outside approved tile inventory');
  const control=await caches.open(CONTROL);const pointer=await control.match(ACTIVE);if(!pointer||(await pointer.json()).pack_id!==m.pack_id)throw Error('No active terrain pack');
  const cache=await caches.open(packCache(m));const marker=await cache.match(READY);if(!marker||(await marker.json()).pack_id!==m.pack_id)throw Error('Terrain pack incomplete');
  const response=await cache.match(event.request);await verify(response,tile);return response;
 }catch{return new Response('Terrain unavailable; no substitute geography',{status:503,headers:{'Content-Type':'text/plain'}});}})());
});
