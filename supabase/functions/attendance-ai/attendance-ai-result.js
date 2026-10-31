export const AI_CAUSES=['','F','M','L104','PHR','congedo parentale','da verificare'];
export const RESULT_SCHEMA={type:'object',additionalProperties:false,required:['month','worker_name','monthly_total_minutes','rows'],properties:{month:{type:['string','null']},worker_name:{type:'string'},monthly_total_minutes:{type:['integer','null']},rows:{type:'array',items:{type:'object',additionalProperties:false,required:['day','total_minutes','absence_minutes','cause','uncertain'],properties:{day:{type:'integer'},total_minutes:{type:['integer','null']},absence_minutes:{type:['integer','null']},cause:{type:'string',enum:AI_CAUSES},uncertain:{type:'boolean'}}}}}};
export function validateResult(data,month){
 if(!data||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>31||typeof data.worker_name!=='string'||data.worker_name.length>200)throw Error('Risultato IA non valido');
 if(data.month!==null&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))throw Error('Mese letto non valido');
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(),seen=new Set();
 const value=(n,max)=>n===null||Number.isInteger(n)&&n>=0&&n<=max;
 if(!value(data.monthly_total_minutes,44640))throw Error('Totale mensile non valido');
 for(const r of data.rows){if(!Number.isInteger(r.day)||r.day<1||r.day>31||seen.has(r.day)||!value(r.total_minutes,1440)||!value(r.absence_minutes,1440)||!AI_CAUSES.includes(r.cause)||typeof r.uncertain!=='boolean')throw Error('Riga IA non valida');if((r.total_minutes||0)+(r.absence_minutes||0)>1440)throw Error('Ore giornaliere oltre 24');if(r.day>count&&(r.total_minutes!==null||r.cause||r.absence_minutes!==null))throw Error('Presenze su un giorno fuori mese');seen.add(r.day);}
 return {month:data.month,worker_name:data.worker_name,monthly_total_minutes:data.monthly_total_minutes,rows:data.rows.filter(r=>r.day<=count).sort((a,b)=>a.day-b.day)};
}
