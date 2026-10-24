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
  map=L.map('map',{crs:L.CRS.EPSG3857,zoomAnimation:false,fadeAnimation:false,minZoom:8,maxZoom:13});map.attributionControl.setPrefix('Leaflet 1.9.4');const addresses=new Set(manifest.tiles.map(t=>`${t.z}/${t.x}/${t.y}`));
  const Terrain=L.TileLayer.extend({createTile(coords,done){if(!addresses.has(`${coords.z}/${coords.x}/${coords.y}`)){const blank=document.createElement('canvas');blank.width=blank.height=256;setTimeout(()=>done(null,blank),0);return blank;}return L.TileLayer.prototype.createTile.call(this,coords,done);}});
  terrain=new Terrain('tiles/{z}/{x}/{y}.png',{tileSize:256,noWrap:true,tms:false,minZoom:8,maxZoom:13,minNativeZoom:10,maxNativeZoom:13,keepBuffer:1,attribution:'USGS 3DEP · experimental'});
  terrain.on('tileerror',()=>{if(map.hasLayer(terrain))map.removeLayer(terrain);$('status').textContent='Terrain pack missing or incomplete. No substitute geography shown.';document.documentElement.dataset.pack='missing';});
  new ResizeObserver(()=>map.invalidateSize({pan:false})).observe($('map'));
  L.control.scale({imperial:false,maxWidth:100,position:'bottomleft'}).addTo(map);
  function inspectCentre(){
   const centre=map.getCenter(),zoom=map.getZoom(),decimals=zoom>=12?4:3;
   $('centre-lat').textContent=centre.lat.toFixed(decimals);$('centre-lon').textContent=centre.lng.toFixed(decimals);$('centre-zoom').textContent=String(zoom);
   if(!bounds.contains(centre)){$('centre-coverage').textContent='Map centre outside Mount Rogers DEM extent; no local terrain coverage.';return;}
   const nativeZoom=Math.max(10,Math.min(13,zoom)),pixel=map.project(centre,nativeZoom),x=Math.floor(pixel.x/256),y=Math.floor(pixel.y/256);
   const tile=manifest.tiles.find(t=>t.z===nativeZoom&&t.x===x&&t.y===y);
   $('centre-coverage').textContent=tile?.coverage==='fully_valid'?'Declared tile coverage: fully supported. Offline pack status is separate.':tile?.coverage==='partial'?'Map centre lies in a partially supported tile; DEM coverage at this point is not confirmed. Offline pack status is separate.':'No supported tile declared at map centre.';
  }
  map.on('moveend zoomend',inspectCentre);
  // Volatile foreground session only: never write fixes to storage or a network.
  const STALE_MS=30000,LOW_ACCURACY_M=100,MAX_LAT=85.0511287798066;
  let generation=0,watchId=null,ageTimer=null,observing=false,following=false,fix=null,marker=null,accuracyCircle=null,followingMove=false;
  function followState(value){following=value;$('follow-location').setAttribute('aria-pressed',String(value));}
  function locationState(message){$('location-state').textContent=message;}
  function clearPresentation(){
   if(marker)map.removeLayer(marker);if(accuracyCircle)map.removeLayer(accuracyCircle);marker=accuracyCircle=null;fix=null;
   for(const id of ['device-lat','device-lon','device-accuracy','device-age'])$(id).textContent='unavailable';
   $('device-coverage').textContent='Device coverage not known. A position does not establish terrain coverage or trail safety.';
  }
  function stopLocation(message='Stopped. Select Locate Me to start again.'){
   generation++;observing=false;followState(false);
   if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;}
   if(ageTimer!==null){clearInterval(ageTimer);ageTimer=null;}
   clearPresentation();$('locate').disabled=false;$('follow-location').disabled=true;$('stop-location').disabled=true;locationState(message);
  }
  function fresh(){return fix&&Date.now()-fix.timestamp>=0&&Date.now()-fix.timestamp<STALE_MS;}
  function recenter(){if(!fresh())return;followingMove=true;try{map.setView([fix.lat,fix.lon],map.getZoom(),{animate:false});}finally{followingMove=false;}}
  function showAge(){
   if(!fresh()){stopLocation('Stale or invalid fix. Location stopped; select Locate Me to retry.');return;}
   $('device-age').textContent=Math.floor((Date.now()-fix.timestamp)/1000)+' s';
  }
  function deviceCoverage(){
   if(!bounds.contains([fix.lat,fix.lon])){$('device-coverage').textContent='Device outside Mount Rogers extent: terrain unavailable here. No navigation or trail safety is established.';return;}
   const pixel=map.project([fix.lat,fix.lon],13),x=Math.floor(pixel.x/256),y=Math.floor(pixel.y/256);
   const tile=manifest.tiles.find(t=>t.z===13&&t.x===x&&t.y===y);
   $('device-coverage').textContent=(tile?.coverage==='partial'?'Device lies in a partially supported tile; DEM coverage at this position is not confirmed.':tile?.coverage==='fully_valid'?'Device lies in a declared fully supported tile.':'No supported terrain tile declared at device position.')+' Coverage across the accuracy circle is not confirmed. Offline pack availability is separate; no trail safety is established.';
  }
  function startLocation(){
   if(observing)return;
   if(document.hidden){locationState('Location requires this page in the foreground.');return;}
   if(!navigator.geolocation){locationState('Device location is unavailable in this browser.');return;}
   const session=++generation;observing=true;followState(true);$('locate').disabled=true;$('stop-location').disabled=false;locationState('Requesting foreground device location. Permission may be required.');
   const current=()=>observing&&generation===session&&!document.hidden;
   try{
    const id=navigator.geolocation.watchPosition(position=>{
     if(!current())return;
     const {latitude:lat,longitude:lon,accuracy}=position?.coords||{},timestamp=position?.timestamp,now=Date.now();
     if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>MAX_LAT||Math.abs(lon)>180||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(timestamp)||timestamp<=0||timestamp>now||now-timestamp>=STALE_MS||(fix&&timestamp<fix.timestamp)){
      stopLocation('Invalid, stale, future-dated or out-of-order fix rejected. Select Locate Me to retry.');return;
     }
     fix={lat,lon,accuracy,timestamp};
     if(!marker){marker=L.circleMarker([lat,lon],{radius:7,color:'#0066ff',fillColor:'#168bff',fillOpacity:1,weight:2,interactive:false,className:'device-position'}).addTo(map);accuracyCircle=L.circle([lat,lon],{radius:accuracy,color:'#168bff',fillColor:'#168bff',fillOpacity:.12,weight:1,interactive:false,className:'device-accuracy'}).addTo(map);}
     else{marker.setLatLng([lat,lon]);accuracyCircle.setLatLng([lat,lon]).setRadius(accuracy);}
     $('device-lat').textContent=lat.toFixed(5);$('device-lon').textContent=lon.toFixed(5);$('device-accuracy').textContent=accuracy.toFixed(1)+' m reported'+(accuracy>LOW_ACCURACY_M?' - LOW ACCURACY':'');
     $('follow-location').disabled=false;showAge();deviceCoverage();locationState((following?'Following':'Observing; follow off')+(accuracy>LOW_ACCURACY_M?' - low accuracy.':'.')+' Foreground only; not navigation.');
     if(following)recenter();if(ageTimer===null)ageTimer=setInterval(showAge,1000);
    },error=>{if(current())stopLocation(({1:'Permission denied.',2:'Position unavailable.',3:'Location acquisition timed out.'})[error?.code]||'Device location failed.');},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
    // Some implementations/test doubles may invoke a callback synchronously.
    if(current())watchId=id;else navigator.geolocation.clearWatch(id);
   }catch{if(current())stopLocation('Device location could not start. Select Locate Me to retry.');}
  }
  function manualView(){if(!followingMove&&following){followState(false);if(observing)locationState('Observing; follow off. Select Follow Me to recenter.');}}
  map.on('movestart zoomstart dragstart',manualView);
  $('locate').addEventListener('click',startLocation);
  $('follow-location').addEventListener('click',()=>{if(!fresh()){stopLocation('No fresh fix. Select Locate Me to retry.');return;}followState(true);recenter();locationState('Following foreground device location; not navigation.');});
  $('stop-location').addEventListener('click',()=>stopLocation());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLocation('Stopped while hidden. Select Locate Me after returning.');});
  addEventListener('pagehide',()=>stopLocation('Stopped on page exit. Select Locate Me to start again.'));
  $('locate').disabled=false;
  const fit=()=>{manualView();map.fitBounds(bounds,{padding:[12,12],maxZoom:13,animate:false});};fit();$('fit').disabled=false;$('fit').addEventListener('click',fit);
  $('terrain-toggle').addEventListener('click',async()=>{wanted=!wanted;$('terrain-toggle').setAttribute('aria-pressed',String(wanted));$('terrain-toggle').textContent=`Terrain: ${wanted?'on':'off'}`;show(lastState);});
  $('install').textContent=`Install offline terrain (${(manifest.total_bytes/1048576).toFixed(2)} MiB)`;
  navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='PACK_PROGRESS'&&busy){$('status').textContent=`Verifying terrain pack · ${event.data.verified}/${event.data.total} tiles`;document.documentElement.dataset.progress=String(event.data.verified);}});
  for(const [id,type] of [['install','INSTALL'],['discard','DISCARD'],['remove','REMOVE']])$(id).addEventListener('click',()=>action(type));
  show(await rpc('STATUS'));document.documentElement.dataset.app='ready';
  if(new URLSearchParams(location.search).has('test'))window.poc={rpc,map,terrain,manifest,fit,refresh:async()=>show(await rpc('STATUS'))};
 }catch(error){$('status').textContent=error.message+' · terrain is unavailable';document.documentElement.dataset.app='failed';}
})();
