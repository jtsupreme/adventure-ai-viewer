import {parseGPX,MAX_BYTES} from './gpx.js';
import {loadTrack,saveTrack,deleteTrack} from './storage.js';
const $=id=>document.getElementById(id);let map,layer;let busy=false;
function status(text){$('status').textContent=text;}
function reset(){if(layer)layer.clearLayers();for(const id of ['points','segments','routes'])$(id).textContent='0';$('creator').textContent='Not supplied';$('digest').textContent='No file imported';$('provenance').textContent='Import a historical GPX. Planning disconnected.';$('fit').disabled=true;$('delete').disabled=true;}
function drawHistoricalTrack(components){
 // Draw the complete halo pass first so dense crossings retain a crisp center.
 // Every pass uses the same unsimplified component points; no segment connectors.
 const strokes=[
  {className:'historical-track-halo',color:'#168dff',weight:10,opacity:0.18},
  {className:'historical-track-main',color:'#24bfff',weight:4,opacity:1},
  {className:'historical-track-highlight',color:'#c0efff',weight:1.25,opacity:0.85}
 ];
 for(const stroke of strokes)for(const part of components)L.polyline(part.points,{...stroke,smoothFactor:0,noClip:true,interactive:false,lineCap:'round',lineJoin:'round'}).addTo(layer);
 for(const part of components){
  L.circleMarker(part.points[0],{className:'historical-track-start',radius:4,color:'#c0efff',weight:1.5,fillColor:'#127bc3',fillOpacity:1,interactive:false}).addTo(layer);
  L.circleMarker(part.points[part.points.length-1],{className:'historical-track-finish',radius:5,color:'#c0efff',weight:1.5,fillColor:'#101c19',fillOpacity:1,interactive:false}).addTo(layer);
 }
}
function render(data){layer.clearLayers();drawHistoricalTrack(data.components);for(const [id,value] of Object.entries({creator:data.creator||'Not supplied',points:data.pointCount.toLocaleString('en-US'),segments:data.segmentCount,routes:data.routeCount,digest:data.digest}))$(id).textContent=value;$('provenance').textContent=data.creator==='COROS Wearables'&&data.routeCount===0?'Historical observed COROS track — visualization only. Not an Adventure AI-generated route or an M1–M19 verified plan.':'Supplied historical GPX — source identity unverified. Not an Adventure AI-generated route or an M1–M19 verified plan.';$('fit').disabled=false;$('delete').disabled=false;map.fitBounds(layer.getBounds());}
async function importBytes(bytes){const data=await parseGPX(bytes);render(data);try{await saveTrack(bytes);status('Track saved locally. Retain the original GPX for recovery.');if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);}catch{status('Track visible but local saving failed. Reimport after relaunch; an older saved track may remain.');}}
try{map=L.map('map',{zoomAnimation:false}).setView([0,0],2);layer=L.featureGroup().addTo(map);L.control.attribution().addAttribution('No basemap configured · historical GPX only');$('fit').addEventListener('click',()=>{if(layer.getLayers().length)map.fitBounds(layer.getBounds());});new ResizeObserver(()=>{document.documentElement.style.setProperty('--header-height',$('header').offsetHeight+'px');map.invalidateSize();}).observe($('header'));
 $('file').addEventListener('change',async()=>{if(busy)return;const f=$('file').files[0];if(!f)return;busy=true;$('file').disabled=true;$('delete').disabled=true;try{if(f.size>MAX_BYTES)throw Error('GPX exceeds the 25 MB limit.');await importBytes(await f.arrayBuffer());}catch(error){status('Import rejected: '+error.message);}finally{busy=false;$('file').disabled=false;$('delete').disabled=!layer.getLayers().length;$('file').value='';}});
 $('delete').addEventListener('click',async()=>{if(busy)return;busy=true;try{await deleteTrack();reset();status('Imported track deleted from app storage.');}catch{reset();status('Track hidden, but deletion from local storage failed. It may reappear; clear this site’s data in Safari settings.');}finally{busy=false;}});
 try{const saved=await loadTrack();if(saved){render(await parseGPX(saved));status('Restored local historical track. Storage persistence is not guaranteed.');}else status('No saved track found. Storage may have been cleared; import from Files.');}catch{status('Local track unavailable or invalid. Reimport from Files.');}finally{$('file').disabled=false;}
}catch{status('Map initialization unavailable. Reload or recover the application shell.');$('file').disabled=true;}
if('serviceWorker' in navigator&&isSecureContext){try{const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});const waiting=()=>{if(reg.waiting){$('update').hidden=false;$('update').onclick=()=>{reg.waiting.postMessage({type:'ACTIVATE'});};}};waiting();reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',waiting);});let reloading=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;location.reload();}});await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Shell caching timed out')),15000))]);$('install').textContent='App shell cached for offline launch. Add to Home Screen; imported GPX is separate local storage.';}catch{$('install').textContent='Offline shell unavailable. HTTPS and successful caching are required.';}}else $('install').textContent='HTTPS required for offline installation (localhost development is allowed).';
