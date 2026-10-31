export const AI_CAUSES=['','F','M','L104','PHR','congedo parentale','da verificare'];
export const RESULT_SCHEMA={type:'object',additionalProperties:false,required:['month','worker_name','monthly_total_minutes','rows'],properties:{month:{type:['string','null']},worker_name:{type:'string'},monthly_total_minutes:{type:['integer','null']},rows:{type:'array',items:{type:'object',additionalProperties:false,required:['day','total_minutes','absence_minutes','cause','uncertain'],properties:{day:{type:'integer'},total_minutes:{type:['integer','null']},absence_minutes:{type:['integer','null']},cause:{type:'string',enum:AI_CAUSES},uncertain:{type:'boolean'}}}}}};
const rawText={type:['string','null']};
RESULT_SCHEMA.required.push('monthly_total_text');RESULT_SCHEMA.properties.monthly_total_text=rawText;
const rowSchema=RESULT_SCHEMA.properties.rows.items;
rowSchema.required.push('total_text','absence_text');rowSchema.properties.total_text=rawText;rowSchema.properties.absence_text=rawText;
export function sheetMinutes(raw,max=1440){
 if(raw==null)return null;const s=String(raw).trim();let m=s.match(/^(\d{1,3})(?:\s*[,.:]\s*(\d{2}))?$/);if(!m)return null;
 const minutes=Number(m[2]||0);if(minutes>59)return null;const total=Number(m[1])*60+minutes;return total<=max?total:null;
}
export function normalizeMonth(value){
 if(value==null)return null;
 const s=String(value).trim().toLowerCase();let m;
 if((m=s.match(/^(\d{4})[-/.](0?[1-9]|1[0-2])(?:[-/.]\d{1,2})?$/)))return m[1]+'-'+m[2].padStart(2,'0');
 if((m=s.match(/^(0?[1-9]|1[0-2])[-/.](\d{4})$/)))return m[2]+'-'+m[1].padStart(2,'0');
 const months=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
 const found=months.map((name,i)=>({name,n:i+1})).filter(x=>new RegExp('\\b'+x.name+'\\b').test(s)),years=s.match(/\b(?:19|20)\d{2}\b/g)||[];
 return found.length===1&&years.length===1?years[0]+'-'+String(found[0].n).padStart(2,'0'):null;
}
export function validateResult(data,month){
 if(!data||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>31||typeof data.worker_name!=='string'||data.worker_name.length>200)throw Error('Risultato IA non valido');
 const readMonth=normalizeMonth(data.month);
 const rows=data.rows.map(r=>{if(!Object.hasOwn(r,'total_text'))return r;const total=sheetMinutes(r.total_text),absence=sheetMinutes(r.absence_text);return {...r,total_text:r.total_text==null?null:String(r.total_text).slice(0,40),absence_text:r.absence_text==null?null:String(r.absence_text).slice(0,40),total_minutes:total,absence_minutes:absence,uncertain:r.uncertain||r.total_text!==null&&total===null||r.absence_text!==null&&absence===null};});
 const monthly=Object.hasOwn(data,'monthly_total_text')?sheetMinutes(data.monthly_total_text,44640):data.monthly_total_minutes;
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(),seen=new Set();
 const value=(n,max)=>n===null||Number.isInteger(n)&&n>=0&&n<=max;
 if(!value(monthly,44640))throw Error('Totale mensile non valido');
 for(const r of rows){if(!Number.isInteger(r.day)||r.day<1||r.day>31||seen.has(r.day)||!value(r.total_minutes,1440)||!value(r.absence_minutes,1440)||!AI_CAUSES.includes(r.cause)||typeof r.uncertain!=='boolean')throw Error('Riga IA non valida');if((r.total_minutes||0)+(r.absence_minutes||0)>1440)throw Error('Ore giornaliere oltre 24');if(r.day>count&&(r.total_minutes!==null||r.cause||r.absence_minutes!==null))throw Error('Presenze su un giorno fuori mese');seen.add(r.day);}
 return {month:readMonth,worker_name:data.worker_name,monthly_total_minutes:monthly,rows:rows.filter(r=>r.day<=count).sort((a,b)=>a.day-b.day)};
}
