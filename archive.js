// Private, read-only worker archive. Supabase RLS remains authoritative.
export function createWorkerArchive({client,allowed,openFile,typeLabel,stageLabel,statusLabel,renderScan=()=>{},onReset=()=>{},reviewDocument=()=>{}}){
 const $=id=>document.getElementById(id),pageSize=20;
 let workers=[],selected='',page=0,version=0,loaded=false;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 function action(text,fn){const b=el('button',text,'doc-button outline');b.type='button';b.onclick=fn;return b;}

 // Monthly export uses the authenticated client and the existing private bucket.
 let exportGeneration=0,exportRows=[],exportBusy=false,exportUrls=[];
 const exportPanel=el('section',null,'card'),exportMonth=el('input'),exportWho=el('select'),exportStatus=el('p','Scegli mese e anno, poi carica l’elenco.','doc-muted'),exportLinks=el('div');
 exportMonth.type='month';exportMonth.className='doc-input';exportMonth.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()).slice(0,7);
 exportWho.className='doc-select';exportWho.append(new Option('Tutti i lavoratori',''));
 const monthLabel=el('label','Mese e anno dei documenti','doc-label');monthLabel.append(exportMonth);
 const whoLabel=el('label','Lavoratore da esportare','doc-label');whoLabel.append(exportWho);
 const refreshExport=action('Carica elenco del mese',loadExport),startExport=action('Prepara esportazione ZIP',runExport),cancelExport=action('Annulla preparazione',()=>{exportGeneration++;exportBusy=false;resetExportLinks();exportMonth.disabled=exportWho.disabled=false;startExport.disabled=false;refreshExport.disabled=false;cancelExport.hidden=true;exportStatus.textContent='Preparazione annullata.';});
 startExport.disabled=true;cancelExport.hidden=true;exportStatus.setAttribute('role','status');exportStatus.setAttribute('aria-live','polite');
 exportPanel.append(el('h3','Esporta documenti'),el('p','Scarica gli originali del mese, divisi per lavoratore e tipologia. Comprende tutti gli stati e gli invii settimanali precedenti.','doc-muted'),monthLabel,refreshExport,whoLabel,startExport,cancelExport,exportStatus,exportLinks);
 document.querySelector('#workerArchive .archive-heading').after(exportPanel);
 const groupKey=d=>d.worker_id||('non-registrato:'+d.site+':'+d.recipient_name);
 const exportName=d=>workers.find(w=>w.id===d.worker_id)?.full_name||d.recipient_name||'Lavoratore';
 const cleanName=v=>String(v||'Documento').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,'_').trim().slice(0,100)||'Documento';
 function resetExportLinks(){for(const url of exportUrls)URL.revokeObjectURL(url);exportUrls=[];exportLinks.replaceChildren();}
 function guardExport(g){if(g!==exportGeneration||!allowed())throw Error('Esportazione interrotta: aggiorna la sessione o riprova.');}
 exportMonth.onchange=()=>{exportGeneration++;exportRows=[];startExport.disabled=true;exportWho.replaceChildren(new Option('Tutti i lavoratori',''));resetExportLinks();exportStatus.textContent='Premi “Carica elenco del mese” per aggiornare i documenti.';};
 async function loadExport(){
  if(!allowed()||exportBusy)return;const month=exportMonth.value;if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)){exportStatus.textContent='Seleziona mese e anno.';return;}
  const g=++exportGeneration;exportBusy=true;exportMonth.disabled=exportWho.disabled=true;refreshExport.disabled=startExport.disabled=true;resetExportLinks();exportRows=[];exportStatus.textContent='Caricamento elenco completo…';
  try{const rows=[];for(let offset=0;;offset+=200){guardExport(g);const {data,error}=await client().from('documents').select('*').eq('month',month).order('id').range(offset,offset+199);guardExport(g);if(error)throw error;rows.push(...data);if(data.length<200)break;}
   exportRows=rows;const groups=new Map();for(const d of rows)groups.set(groupKey(d),exportName(d));exportWho.replaceChildren(new Option('Tutti i lavoratori ('+groups.size+')',''));for(const [key,name]of [...groups].sort((a,b)=>a[1].localeCompare(b[1],'it')))exportWho.append(new Option(name,key));if(selected&&groups.has(selected))exportWho.value=selected;
   exportStatus.textContent=rows.length+' documenti · '+groups.size+' lavoratori. Seleziona un lavoratore oppure tutti.';startExport.disabled=!rows.length;
  }catch(e){if(g===exportGeneration)exportStatus.textContent='Elenco non disponibile: '+e.message;}finally{if(g===exportGeneration){exportBusy=false;exportMonth.disabled=exportWho.disabled=false;refreshExport.disabled=false;}}
 }
 async function runExport(){
  if(!allowed()||exportBusy||!exportRows.length)return;
  const g=++exportGeneration,month=exportMonth.value,who=exportWho.value,rows=exportRows.filter(d=>!who||groupKey(d)===who),api=client();exportBusy=true;exportMonth.disabled=exportWho.disabled=true;startExport.disabled=refreshExport.disabled=true;cancelExport.hidden=false;resetExportLinks();
  try{const {zipSync,strToU8}=await import('./vendor/fflate.js');guardExport(g);let files=Object.create(null),bytes=0,part=0,ok=0;const report=['Esportazione originali · '+month,'Documenti previsti: '+rows.length],limit=60*1024*1024;
   const packagePart=()=>{if(!Object.keys(files).length)return;guardExport(g);const zip=zipSync(files,{level:0}),url=URL.createObjectURL(new Blob([zip],{type:'application/zip'}));exportUrls.push(url);const a=el('a','Scarica ZIP · parte '+(++part),'doc-button outline');a.style.display='block';a.style.textAlign='center';a.href=url;a.download='Documenti_'+month+'_parte-'+part+'.zip';exportLinks.append(a);files=Object.create(null);bytes=0;};
   for(let i=0;i<rows.length;i++){guardExport(g);const d=rows[i];exportStatus.textContent='Preparazione '+(i+1)+' di '+rows.length+' · '+exportName(d);
    try{const {data,error}=await api.storage.from('private-documents').download(d.file_path);guardExport(g);if(error)throw error;if(bytes+data.size>limit)packagePart();const path=cleanName(exportName(d))+'_'+cleanName(groupKey(d))+'/'+cleanName(typeLabel[d.category]||d.category)+'/'+cleanName(d.stage)+'_'+d.id+'_'+cleanName(d.file_name);files[path]=new Uint8Array(await data.arrayBuffer());bytes+=data.size;ok++;report.push('OK · '+path);}
    catch(e){guardExport(g);report.push('ERRORE · '+exportName(d)+' · '+d.id+' · '+e.message);}
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   guardExport(g);report.push('Scaricati: '+ok+' / '+rows.length);files['RIEPILOGO.txt']=strToU8(report.join('\n'));packagePart();exportStatus.textContent=ok+' di '+rows.length+' documenti preparati. '+(ok<rows.length?'ATTENZIONE: esportazione incompleta; consulta RIEPILOGO.txt nell’ultimo ZIP. ':'')+'Scarica '+(part===1?'il file ZIP.':'tutte le '+part+' parti ZIP.');exportRows=[];
  }catch(e){if(g===exportGeneration){resetExportLinks();exportStatus.textContent='Esportazione non completata: '+e.message;}}
  finally{if(g===exportGeneration){exportBusy=false;exportMonth.disabled=exportWho.disabled=false;refreshExport.disabled=false;startExport.disabled=!exportRows.length;cancelExport.hidden=true;}}
 }

 function visibleWorkers(){const term=$('archiveSearch').value.trim().toLocaleLowerCase('it');return workers.filter(p=>(!$('archiveSite').value||p.site===$('archiveSite').value)&&(!term||(p.full_name||'').toLocaleLowerCase('it').includes(term)));}
 function renderWorkers(){
  const list=$('archiveWorkers'),select=$('archiveWorker');list.replaceChildren();select.replaceChildren(new Option('Seleziona un lavoratore',''));
  const filtered=visibleWorkers();$('archiveWorkerCount').textContent=filtered.length+' lavoratori';
  for(const p of filtered){const label=(p.full_name||'Lavoratore senza nome')+' · '+(p.site||'Sede da assegnare')+(p.active?'':' · Non attivo');select.add(new Option(label,p.id));const b=action('',()=>choose(p.id));b.className='archive-person';b.setAttribute('aria-pressed',String(p.id===selected));b.append(el('strong',p.full_name||'Lavoratore senza nome'),el('small',(p.site||'Sede da assegnare')+(p.active?'':' · Non attivo')));list.append(b);}
  select.value=selected;
  if(!filtered.length)list.append(el('p','Nessun lavoratore corrisponde alla ricerca.','doc-muted'));
 }
 function choose(id){selected=id;page=0;renderWorkers();load();}
 async function load(){
  onReset();const token=++version,area=$('archiveDocuments'),pager=$('archivePages');area.replaceChildren();pager.replaceChildren();
  if(!allowed()){clear();return;}
  const person=workers.find(p=>p.id===selected);
  $('archivePersonName').textContent=person?.full_name||'Scegli un lavoratore';
  $('archivePersonInfo').textContent=person?[(person.site||'Sede da assegnare'),person.active?'Attivo':'Non attivo'].join(' · '):'Consulta lo storico completo, anche dei mesi precedenti.';
  if(!person){$('archiveResult').textContent='';area.append(el('p','Cerca un nome e seleziona il lavoratore per aprire il suo archivio.','archive-empty'));return;}
  area.setAttribute('aria-busy','true');$('archiveResult').textContent='Caricamento documenti…';
  try{
   let q=client().from('documents').select('*',{count:'exact'}).eq('worker_id',selected);
   if($('archiveMonth').value)q=q.eq('month',$('archiveMonth').value);
   const type=$('archiveType').value;
   if(type==='weekly')q=q.eq('category','presenze').in('stage',['weekly','replacement']);
   else if(type==='final')q=q.eq('category','presenze').eq('stage','final');
   else if(type)q=q.eq('category',type);
   if($('archiveStatus').value)q=q.eq('review_status',$('archiveStatus').value);
   const {data,error,count}=await q.order('month',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*pageSize,(page+1)*pageSize-1);
   if(token!==version||!allowed())return;
   if(error)throw error;
   if(page>0&&!data?.length){page=0;return load();}
   const total=count??data.length;
   $('archiveResult').textContent=total+' documenti'+(total?' · '+(page*pageSize+1)+'–'+Math.min((page+1)*pageSize,total):'');
   if(!data.length)area.append(el('p','Nessun documento per questi filtri. Prova “Tutti i mesi” o un altro tipo.','archive-empty'));
   let month='';
   for(const d of data){
    if(d.month!==month){month=d.month;const date=new Date((month.length===7?month+'-01':month)+'T12:00:00');area.append(el('h3',Number.isNaN(date.getTime())?month:date.toLocaleDateString('it-IT',{month:'long',year:'numeric'}),'archive-month-title'));}
    const row=el('article',null,'archive-document'),info=el('div');
    info.append(el('strong',typeLabel[d.category]||'Documento'),el('span',stageLabel[d.stage]||'Modulo','archive-stage'));
    if(d.week_ending)info.append(el('small','Venerdì '+new Date(d.week_ending+'T12:00:00').toLocaleDateString('it-IT')));
    info.append(el('small','Caricato il '+new Date(d.created_at).toLocaleString('it-IT')));
    if(d.replaces)info.append(el('small','Sostituisce un precedente invio settimanale.'));
    const state=el('span',statusLabel[d.review_status]||d.review_status,'doc-pill '+(d.review_status==='pending'?'pending':d.review_status==='rejected'?'rejected':''));info.append(state);
    if(['ferie','rol'].includes(d.category))info.append(el('small',d.authorization==='approved'?'Richiesta autorizzata':d.authorization==='denied'?'Richiesta non autorizzata':'Autorizzazione in attesa'));
    if(d.review_reason)info.append(el('small','Motivo: '+d.review_reason));
    const details=el('details',null,'file-details');details.append(el('summary','Dettagli file'),el('small',d.file_name||'Documento'));info.append(details);
    const b=action('Apri documento',()=>{if(allowed())openFile(d);});b.setAttribute('aria-label','Apri '+(typeLabel[d.category]||'documento')+' del '+new Date(d.created_at).toLocaleDateString('it-IT'));
    if(d.review_status==='pending'){const controls=el('div',null,'doc-toolbar');controls.append(action('Verifica',()=>reviewDocument(d,'verified')),action('Respingi',()=>reviewDocument(d,'rejected')));info.append(controls);}
    row.append(info);area.append(row);renderScan(d,info);
   }
   if(page>0)pager.append(action('← Precedenti',()=>{page--;load();}));
   if((page+1)*pageSize<total)pager.append(action('Successivi →',()=>{page++;load();}));
  }catch(e){if(token!==version)return;$('archiveResult').textContent='Archivio non disponibile.';area.replaceChildren(el('p','Non è stato possibile caricare i documenti: '+(e.message||'errore di rete'),'doc-muted'),action('Riprova',load));}
  finally{if(token===version)area.removeAttribute('aria-busy');}
 }
 function clear(){exportGeneration++;exportBusy=false;exportMonth.disabled=exportWho.disabled=false;exportRows=[];resetExportLinks();exportWho.replaceChildren(new Option("Tutti i lavoratori",""));startExport.disabled=true;refreshExport.disabled=false;cancelExport.hidden=true;exportStatus.textContent="Scegli mese e anno, poi carica l’elenco.";onReset();for(const id of ['archiveSearch','archiveSite','archiveMonth','archiveType','archiveStatus'])$(id).value='';version++;workers=[];selected='';loaded=false;page=0;renderWorkers();$('archiveDocuments').replaceChildren();$('archivePages').replaceChildren();$('archiveResult').textContent='';$('archivePersonName').textContent='Scegli un lavoratore';$('archivePersonInfo').textContent='';}
 $('archiveWorker').onchange=()=>choose($('archiveWorker').value);
 for(const id of ['archiveSearch','archiveSite'])$(id).addEventListener(id==='archiveSearch'?'input':'change',()=>{if(!allowed())return;if(selected&&!visibleWorkers().some(p=>p.id===selected)){selected='';page=0;load();}renderWorkers();});
 for(const id of ['archiveMonth','archiveType','archiveStatus'])$(id).onchange=()=>{page=0;load();};
 $('archiveAllMonths').onclick=()=>{$('archiveMonth').value='';page=0;load();};
 $('archiveRefresh').onclick=()=>load();
 for(const [id,mode] of [['showArchive','archive'],['showOperations','operations']])$(id).onclick=()=>{if(!allowed())return;$('workerArchive').classList.toggle('hidden',mode!=='archive');$('adminOperations').classList.toggle('hidden',mode!=='operations');$('showArchive').setAttribute('aria-pressed',String(mode==='archive'));$('showOperations').setAttribute('aria-pressed',String(mode==='operations'));if(mode==='archive')load();};
 return {clear,setWorkers(rows){if(!allowed()){clear();return;}workers=rows.filter(p=>p.role==='worker').sort((a,b)=>(a.full_name||'').localeCompare(b.full_name||'','it'));if(selected&&!workers.some(p=>p.id===selected))selected='';renderWorkers();loaded=true;return load();}};
}



