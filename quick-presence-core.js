export const comparePeople=(a,b)=>a.surname.localeCompare(b.surname,'it',{sensitivity:'base'})||a.given_name.localeCompare(b.given_name,'it')||a.id.localeCompare(b.id);
export function rosterRows(accounts,people=[]){
 const linked=new Set(people.map(p=>p.account_id).filter(Boolean));
 return [...people.map(p=>({...p,id:p.account_id||p.person_key,label:p.surname+' '+p.given_name})),...accounts.filter(a=>!linked.has(a.id)).map(a=>{const parts=(a.full_name||'Senza nome').trim().split(/\s+/);return {...a,account_id:a.id,surname:parts.pop(),given_name:parts.join(' '),label:a.full_name,unverifiedName:true};})].sort(comparePeople);
}
export function presenceFiles(documents,worker,month,period=null){
 const eligible=documents.filter(d=>d.category==='presenze'&&d.month===month&&d.review_status!=='rejected'&&(worker.account_id?d.worker_id===worker.account_id:d.recipient_person_key===worker.person_key));
 const scoped=period==='final'?eligible.filter(d=>d.stage==='final'):period?eligible.filter(d=>['weekly','replacement'].includes(d.stage)&&weekKey(d.week_ending)===period):eligible;
 const replaced=new Set(scoped.map(d=>d.replaces).filter(Boolean));
 return scoped.filter(d=>!replaced.has(d.id)).sort((a,b)=>Number(b.stage==='final')-Number(a.stage==='final')||(b.created_at||'').localeCompare(a.created_at||'')||b.id.localeCompare(a.id));
}
export const consultationKey=(actor,month,worker,doc)=>['lf-presenze-consultato',actor,month,worker,doc?.id,doc?.created_at].join(':');

export function weekKey(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const date=new Date(value+'T12:00:00Z');if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)return null;
 date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7)+4);return date.toISOString().slice(0,10);
}
export function weekLabel(friday){const d=new Date(friday+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-4);const start=d.toLocaleDateString('it-IT',{timeZone:'UTC'});d.setUTCDate(d.getUTCDate()+6);return start+' – '+d.toLocaleDateString('it-IT',{timeZone:'UTC'});}
export function weeksForMonth(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];const d=new Date(month+'-01T12:00:00Z'),out=[];for(;d.toISOString().slice(0,7)===month;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()===5)out.push(d.toISOString().slice(0,10));return out;}
