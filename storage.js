const NAME='adventure-ai-historical-v1';
function open(){return new Promise((resolve,reject)=>{const req=indexedDB.open(NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Local storage blocked. Close other app windows.'));});}
async function operation(mode,work){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode);let result;const request=work(tx.objectStore('files'));request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage operation aborted.'));});}finally{db.close();}}
export const loadTrack=()=>operation('readonly',s=>s.get('selected'));
export const saveTrack=bytes=>operation('readwrite',s=>s.put(bytes,'selected'));
export const deleteTrack=()=>operation('readwrite',s=>s.delete('selected'));
