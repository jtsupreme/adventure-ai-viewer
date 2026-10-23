'use strict';
(async()=>{
 const $=id=>document.getElementById(id);let map,terrain,manifest,lastState,wanted=true,busy=false;
 function rpc(type){return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('Prototype worker timeout')),type==='INSTALL'?900000:60000);channel.port1.onmessage=e=>{clearTimeout(timer);e.data.ok?resolve(e.data.data):reject(new Error(e.data.error));};navigator.serviceWorker.controller.postMessage({type:'TERRAIN_'+type},[channel.port2]);});}
 function show(state){lastState=state;document.documentElement.dataset.pack=state.ready?'ready':state.staging?'staging':'missing';$('status').textContent=state.ready?`Offline terrain ready · ${state.verified_tiles}/417 tiles verified`:state.staging?`Incomplete pack · ${state.verified_tiles}/417 tiles verified; resume or discard`:'Offline shell ready · no terrain pack. Navy canvas remains available.';$('install').disabled=busy||state.ready;$('discard').disabled=busy||!state.staging;$('remove').disabled=busy||!state.ready;$('terrain-toggle').disabled=busy||!state.ready;
  if(state.ready&&wanted){if(!map.hasLayer(terrain))terrain.addTo(map);}else if(map.hasLayer(terrain))map.removeLayer(terrain);
 }
 async function action(type){
  busy=true;let failure='';for(const id of ['install','discard','remove'])$(id).disabled=true;
  document.documentElement.dataset.action='working';$('status').textContent=type==='INSTALL'?'Installing: verifying and staging terrain assets...':'Updating only the terrain pack...';
  try{show(await rpc(type));}catch(error){failure=error.message;}
  finally{
   busy=false;
   try{show(await rpc('STATUS'));}catch(error){failure=failure||error.message;$('status').textContent='Shell ready - terrain pack status unavailable';for(const id of ['install','discard','remove'])$(id).disabled=true;}
   if(failure)$('status').textContent='Interrupted or failed: '+failure+' - '+$('status').textContent;
   document.documentElement.dataset.action=failure?'failed':'done';
  }
 }

 try{
  if(!isSecureContext)throw new Error('HTTPS or localhost required');
  if(!navigator.serviceWorker)throw new Error('Offline service workers are unavailable; use supported Safari over HTTPS');
  const registration=await navigator.serviceWorker.getRegistration(new URL('../',location.href).href);
  if(!registration||registration.scope!==new URL('../',location.href).href)throw new Error('Application shell missing. Return to Historical Viewer online first');
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)throw new Error('Application shell not controlling this page. Return to Historical Viewer first');
  const response=await fetch('pack-manifest.json');if(!response.ok)throw new Error('Shell manifest missing');manifest=await response.json();const [w,s,e,n]=manifest.bounds_wgs84;const bounds=L.latLngBounds([s,w],[n,e]);
  map=L.map('map',{zoomAnimation:false,fadeAnimation:false,minZoom:8,maxZoom:13});map.attributionControl.setPrefix('Leaflet 1.9.4');const addresses=new Set(manifest.tiles.map(t=>`${t.z}/${t.x}/${t.y}`));
  const Terrain=L.TileLayer.extend({createTile(coords,done){if(!addresses.has(`${coords.z}/${coords.x}/${coords.y}`)){const blank=document.createElement('canvas');blank.width=blank.height=256;setTimeout(()=>done(null,blank),0);return blank;}return L.TileLayer.prototype.createTile.call(this,coords,done);}});
  terrain=new Terrain('tiles/{z}/{x}/{y}.png',{tileSize:256,noWrap:true,tms:false,minZoom:8,maxZoom:13,minNativeZoom:10,maxNativeZoom:13,keepBuffer:1,attribution:'USGS 3DEP · experimental'});
  terrain.on('tileerror',()=>{if(map.hasLayer(terrain))map.removeLayer(terrain);$('status').textContent='Terrain pack missing or incomplete. No substitute geography shown.';document.documentElement.dataset.pack='missing';});
  new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('map'));
  const fit=()=>map.fitBounds(bounds,{padding:[12,12],maxZoom:13,animate:false});fit();$('fit').disabled=false;$('fit').addEventListener('click',fit);
  $('terrain-toggle').addEventListener('click',async()=>{wanted=!wanted;$('terrain-toggle').setAttribute('aria-pressed',String(wanted));$('terrain-toggle').textContent=`Terrain: ${wanted?'on':'off'}`;show(lastState);});
  $('install').textContent=`Install offline terrain (${(manifest.total_bytes/1048576).toFixed(2)} MiB)`;
  navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='PACK_PROGRESS'&&busy){$('status').textContent=`Verifying terrain pack · ${event.data.verified}/${event.data.total} tiles`;document.documentElement.dataset.progress=String(event.data.verified);}});
  for(const [id,type] of [['install','INSTALL'],['discard','DISCARD'],['remove','REMOVE']])$(id).addEventListener('click',()=>action(type));
  show(await rpc('STATUS'));document.documentElement.dataset.app='ready';
  if(new URLSearchParams(location.search).has('test'))window.poc={rpc,map,terrain,manifest,fit,refresh:async()=>show(await rpc('STATUS'))};
 }catch(error){$('status').textContent=error.message+' · terrain is unavailable';document.documentElement.dataset.app='failed';}
})();
