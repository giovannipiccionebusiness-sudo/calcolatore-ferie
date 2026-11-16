export const comparePeople=(a,b)=>a.surname.localeCompare(b.surname,'it',{sensitivity:'base'})||a.given_name.localeCompare(b.given_name,'it')||a.id.localeCompare(b.id);
export function rosterRows(accounts,people=[]){
 const linked=new Set(people.map(p=>p.account_id).filter(Boolean));
 return [...people.map(p=>({...p,id:p.account_id||p.person_key,label:p.surname+' '+p.given_name})),...accounts.filter(a=>!linked.has(a.id)).map(a=>{const parts=(a.full_name||'Senza nome').trim().split(/\s+/);return {...a,account_id:a.id,surname:parts.pop(),given_name:parts.join(' '),label:a.full_name,unverifiedName:true};})].sort(comparePeople);
}
export function presenceFiles(documents,worker,month){
 const eligible=documents.filter(d=>d.category==='presenze'&&d.month===month&&d.review_status!=='rejected'&&(worker.account_id?d.worker_id===worker.account_id:d.recipient_person_key===worker.person_key));
 const replaced=new Set(eligible.map(d=>d.replaces).filter(Boolean));
 return eligible.filter(d=>!replaced.has(d.id)).sort((a,b)=>Number(b.stage==='final')-Number(a.stage==='final')||(b.created_at||'').localeCompare(a.created_at||'')||b.id.localeCompare(a.id));
}
export const consultationKey=(actor,month,worker,doc)=>['lf-presenze-consultato',actor,month,worker,doc?.id,doc?.created_at].join(':');
