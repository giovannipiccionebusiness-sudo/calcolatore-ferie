import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';

function archiveFailure(status,data={}){
 const reconnect=data.code==='ARCHIVE_RECONNECT_REQUIRED'||/Google:\s*invalid_grant/i.test(data.error||'');
 const error=new Error(reconnect?'Il collegamento a Google Drive deve essere rinnovato dal responsabile.':status===401?'Sessione scaduta. Accedi nuovamente.':'Il documento archiviato non è al momento disponibile. Riprova.');
 error.code=reconnect?'ARCHIVE_RECONNECT_REQUIRED':status===401?'SESSION_REQUIRED':'ARCHIVE_UNAVAILABLE';return error;
}
export async function downloadDocument(client, document, accessToken) {
 if(!accessToken)throw archiveFailure(401);
 let failure=null;
 try{
  const response=await fetch(SUPABASE_URL+'/functions/v1/drive-archive',{
   method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
   body:JSON.stringify({action:'read-archived',document_id:document.id}),signal:AbortSignal.timeout(25000)
  });
  if(response.ok)return await response.blob();
  failure=archiveFailure(response.status,await response.json().catch(()=>({})));
 }catch{failure=archiveFailure(503);}
 // Newly uploaded originals may still be available before Drive cleanup.
 try{const original=await client.storage.from('private-documents').download(document.file_path);if(!original.error&&original.data)return original.data;}catch{}
 throw failure||archiveFailure(404);
}
export async function documentObjectUrl(client,document,accessToken){
 const url=URL.createObjectURL(await downloadDocument(client,document,accessToken));setTimeout(()=>URL.revokeObjectURL(url),120000);return url;
}
