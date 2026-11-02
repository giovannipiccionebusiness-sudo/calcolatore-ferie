import {effective,scheduled,latestSheet} from './hour-budget-core.js?v=70';
export function declarationMarker(day,version){return 'Dichiarazione del lavoratore del '+day.slice(8,10)+'/'+day.slice(5,7)+'/'+day.slice(0,4)+' (v'+version+')';}
export function declarationAcknowledged(record,declaration,day){return !!record?.confirmed&&!!declaration&&String(record.source_note||'').includes(declarationMarker(day,declaration.version));}
export function declarationNote(note,day,version){const marker=declarationMarker(day,version),text=String(note||'').trim();return text.includes(marker)?text:(text?text+' · ':'')+marker;}
export function createDeclarationDraft({declaration,record,expected,assignment,day,today,recordValid=false}){
 if(!declaration||day>today)return null;
 if(recordValid&&declarationAcknowledged(record,declaration,day))return null;
 const extra=declaration.supplementary_minutes,cause=declaration.cause||'',full=declaration.absence_scope==='full',partial=declaration.absence_scope==='partial';
 const known=Number.isFinite(expected)&&expected>=0&&expected<=1440,contract=known?Math.round(expected):null;
 const absence=full?contract:partial?declaration.absence_minutes:0;
 const ordinary=known&&Number.isInteger(absence)?Math.max(0,contract-absence):null;
 let reason='';if(assignment?.included===false)reason='Lavoratore escluso: verifica la partecipazione';
 else if(!known||absence===null)reason='Contratto giornaliero da impostare';
 else if(!Number.isInteger(extra)||extra<0||!Number.isInteger(absence)||absence<0||absence>contract||ordinary+extra+absence>1440)reason='Ore dichiarate da controllare';
 else if((record?.allocations?.length||0)>1)reason='Più sedi: ripartisci le ore';
 const workplace=record?.allocations?.length===1?record.allocations[0].workplace:assignment?.workplace;
 if(!reason&&!workplace)reason='Sede da assegnare';
 return {ordinary,extra,absence,cause,ready:!reason,reason,version:declaration.version,changed:!!record,allocations:!reason?[{workplace,ordinary,overtime:extra}]:null};
}
// Pure projection: one row per worker/day, no database writes and no accumulation.
export function buildAutomaticProjection(state,today){
 const records=new Map((state.records||[]).map(r=>[r.person_key+'|'+r.day,r])),verified=new Map(records),projected=new Map(records),drafts=[];
 for(const p of state.people||[]){if(!p.account_id)continue;
  const declarations=new Map();for(const d of state.declarations||[])if(d.worker_id===p.account_id&&(!declarations.has(d.day)||declarations.get(d.day).version<d.version))declarations.set(d.day,d);
  for(const [day,declaration]of declarations){const key=p.person_key+'|'+day,record=records.get(key),a=p.site==='N148'||p.site==='N154'?{included:true,workplace:p.site}:effective((state.assignments||[]).filter(a=>a.person_key===p.person_key),day),sheet=latestSheet(state.documents||[],p.account_id,day,p.imported_key||p.person_key),recordValid=day<=today&&!!record?.confirmed&&(!record.document_id||record.document_id===sheet?.id),draft=createDeclarationDraft({declaration,record,expected:scheduled(state.configs?.[p.person_key],day),assignment:a,day,today,recordValid});
   if(!draft)continue;drafts.push({...draft,person_key:p.person_key,day,site:p.site});
   if(record){verified.set(key,{...record,confirmed:false});projected.set(key,{...record,confirmed:false});}
   if(draft.ready)projected.set(key,{person_key:p.person_key,day,allocations:draft.allocations,absence_minutes:draft.absence,justification:draft.cause,document_id:null,source_note:declarationMarker(day,draft.version),confirmed:true,automatic_draft:true});
  }
 }
 return {verifiedRecords:[...verified.values()],projectedRecords:[...projected.values()],drafts};
}
