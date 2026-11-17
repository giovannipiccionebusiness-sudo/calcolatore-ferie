export function periodStart(month,period){if(period==='final')return month+'-01';const d=new Date(period+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-4);return d.toISOString().slice(0,10);}
export function employmentFor(person,records){return records.find(r=>r.worker_key===person.id||(person.person_key&&r.person_key===person.person_key)||(person.account_id&&r.account_id===person.account_id))||null;}
export function ceasedBefore(person,records,month,period){const row=employmentFor(person,records);return !!row?.last_day&&row.last_day<periodStart(month,period);}
