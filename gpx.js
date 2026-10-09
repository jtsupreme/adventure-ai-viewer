export const MAX_BYTES=25000000, MAX_POINTS=200000;
export async function parseGPX(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>MAX_BYTES)throw Error('GPX exceeds the 25 MB limit or is unsupported.');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Only UTF-8 GPX XML is supported.');}
 if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(text))throw Error('XML document types/entities are unsupported.');
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error('Malformed GPX XML.');
 const root=doc.documentElement, ns=root.namespaceURI||'';
 if(root.localName!=='gpx'||!['','http://www.topografix.com/GPX/1/0','http://www.topografix.com/GPX/1/1'].includes(ns))throw Error('Expected GPX 1.0/1.1.');
 const children=(node,name)=>Array.from(node.children).filter(x=>x.localName===name&&(x.namespaceURI||'')===ns);
 const components=[];let count=0;
 const points=(node,name)=>{const values=children(node,name).map(p=>{const a=p.getAttribute('lat'),b=p.getAttribute('lon');if(a===null||b===null||!a.trim()||!b.trim())throw Error('Missing coordinates.');const lat=Number(a),lon=Number(b);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180)throw Error('Invalid geographic coordinates.');if(++count>MAX_POINTS)throw Error('GPX exceeds 200,000 points.');return [lat,lon];});if(values.length<2)throw Error('Each segment/route requires at least two points.');return values;};
 for(const node of root.children){if((node.namespaceURI||'')!==ns)continue;if(node.localName==='trk'){const segments=children(node,'trkseg');if(!segments.length)throw Error('Track without segments.');for(const seg of segments)components.push({kind:'track',points:points(seg,'trkpt')});}else if(node.localName==='rte')components.push({kind:'route',points:points(node,'rtept')});}
 if(!components.length)throw Error('No supported GPX track segments or routes.');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 return {creator:root.getAttribute('creator')||'',components,pointCount:count,segmentCount:components.filter(x=>x.kind==='track').length,routeCount:components.filter(x=>x.kind==='route').length,digest};
}
