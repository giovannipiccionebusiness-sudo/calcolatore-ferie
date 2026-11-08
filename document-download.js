import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';

export async function downloadDocument(client, document) {
  const {data, error} = await client.auth.getSession();
  if (error || !data.session) throw Error('Accedi nuovamente.');
  try {
    const response = await fetch(SUPABASE_URL + '/functions/v1/drive-archive', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({action: 'read-archived', document_id: document.id}),
      signal: AbortSignal.timeout(25000)
    });
    if (response.ok) return await response.blob();
  } catch {
    // Documents can still be available in private storage during archiving.
  }
  const original = await client.storage.from('private-documents').download(document.file_path);
  if (original.error || !original.data) throw Error('Documento non disponibile. Riprova.');
  return original.data;
}

export async function documentObjectUrl(client, document) {
  const url = URL.createObjectURL(await downloadDocument(client, document));
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return url;
}
