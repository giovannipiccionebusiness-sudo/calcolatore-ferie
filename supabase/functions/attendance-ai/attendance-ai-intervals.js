import {normalizeMonth,sheetMinutes,AI_CAUSES} from './attendance-ai-result.js';
const text={type:['string','null']};
const rowProperties={day:{type:'integer'},printed_day:{type:['integer','null']},entry_1:text,exit_1:text,entry_2:text,exit_2:text,row_state:{type:'string',enum:['blank','worked','absence','unclear']},cause:{type:'string',enum:AI_CAUSES},absence_text:text,uncertain:{type:'boolean'}};
export const RESULT_SCHEMA={type:'object',additionalProperties:false,required:['month','worker_name','monthly_total_text','rows'],properties:{month:text,worker_name:{type:'string'},monthly_total_text:text,rows:{type:'array',items:{type:'object',additionalProperties:false,required:Object.keys(rowProperties),properties:rowProperties}}}};
export function clockMinutes(raw){
 if(typeof raw!=='string')return null;const m=raw.trim().match(/^(\d{1,2})\s*[:.,]\s*(\d{2})$/);if(!m)return null;const h=Number(m[1]),min=Number(m[2]);return h<=23&&min<=59?h*60+min:h===24&&min===0?1440:null;
}
export function intervalDuration(row){
 const fields=['entry_1','exit_1','entry_2','exit_2'],present=fields.map(k=>row[k]!==null&&row[k]!==undefined&&String(row[k]).trim()!=='');
 const ranges=[fields.slice(0,2),fields.slice(2)],result={total_minutes:null,reason:'',time_ranges:ranges.map(pair=>pair.map(k=>row[k]||'—').join(' → ')).join(' / ')};
 if(row.row_state==='blank'){result.reason=present.some(Boolean)?'Riga indicata vuota ma con orari: verifica':'Riga vuota';return result;}
 if(!present.some(Boolean)){result.reason=row.cause?'Assenza senza orari di lavoro':'Orari non indicati';return result;}
 if(row.uncertain||row.row_state==='unclear'){result.reason='Lettura incerta';return result;}
 let total=0,lastEnd=null;
 for(const [from,to]of ranges){if(row[from]===null&&row[to]===null)continue;
  const start=clockMinutes(row[from]),end=clockMinutes(row[to]);
  if(start===null||end===null){result.reason='Fascia incompleta o orario non valido';return result;}
  if(end<=start){result.reason='Uscita precedente o uguale all’entrata: verifica anche eventuale turno notturno';return result;}
  if(lastEnd!==null&&start<lastEnd){result.reason='Fasce sovrapposte o fuori ordine';return result;}
  total+=end-start;lastEnd=end;
 }
 if(total>1440){result.reason='Durata oltre 24 ore';return result;}result.total_minutes=total;return result;
}
export function validateResult(data,month,isolated=false){
 if(!data||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>31||typeof data.worker_name!=='string'||data.worker_name.length>200)throw Error('Risultato fasce orarie non valido');
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(),seen=new Set(),rows=[];
 for(const r of data.rows){if(!Number.isInteger(r.day)||r.day<1||r.day>31||seen.has(r.day)||!AI_CAUSES.includes(r.cause)||!['blank','worked','absence','unclear'].includes(r.row_state)||typeof r.uncertain!=='boolean')throw Error('Riga fasce non valida');seen.add(r.day);
  for(const key of ['entry_1','exit_1','entry_2','exit_2','absence_text'])if(r[key]!==null&&(typeof r[key]!=='string'||r[key].length>40))throw Error('Orario letto non valido');
  if(isolated&&r.printed_day!==r.day){r.entry_1=r.exit_1=r.entry_2=r.exit_2=r.absence_text=null;r.cause='';r.uncertain=true;r.row_state='unclear';}
  const duration=intervalDuration(r),absence=sheetMinutes(r.absence_text);
  if(isolated&&r.printed_day!==r.day)duration.reason='Numero GG non leggibile o diverso dal ritaglio: verifica obbligatoria';
  if(r.day>count){if([r.entry_1,r.exit_1,r.entry_2,r.exit_2,r.absence_text].some(x=>x!==null)||r.cause)throw Error('Orari su un giorno fuori mese');continue;}
  if((duration.total_minutes||0)+(absence||0)>1440)throw Error('Lavoro e assenza oltre 24 ore');
  rows.push({...r,...duration,total_text:duration.time_ranges,absence_minutes:absence,uncertain:r.uncertain||duration.total_minutes===null||r.absence_text!==null&&absence===null});
 }
 if(isolated&&seen.size!==31)throw Error('Lettura righe incompleta: attesi tutti i 31 ritagli');
 return {method:isolated?'isolated-rows':'intervals',month:normalizeMonth(data.month),worker_name:data.worker_name,monthly_total_minutes:sheetMinutes(data.monthly_total_text,44640),rows:rows.sort((a,b)=>a.day-b.day)};
}
