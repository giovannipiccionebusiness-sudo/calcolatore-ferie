import {effective,scheduled,latestSheet,monthRange,weekRange,hours} from './hour-budget-core.js?v=70';
export {effective,scheduled,latestSheet,monthRange,weekRange,hours};
export const CDCS={N153:'N153 · Corte d’Appello',N148:'N148 · ENAV',N154:'N154 · Acquedotto Pugliese'};
export function assembleRoster(imported,accounts,registry){
 const people=[],used=new Set();
 for(const p of imported){const hire=registry.find(r=>r.account_id&&r.account_id===p.account_id),account=accounts.find(a=>a.id===p.account_id);people.push({...p,site:account?.site||p.site,person_key:hire?.person_key||p.person_key,imported_key:p.person_key});if(p.account_id)used.add(p.account_id);}
 for(const a of accounts){if(used.has(a.id)||!CDCS[a.site])continue;const r=registry.find(r=>r.account_id===a.id);people.push({person_key:r?.person_key||'ACCOUNT:'+a.id,account_id:a.id,surname:r?.surname||a.full_name||'Nome da completare',given_name:r?.given_name||'',site:a.site,active:a.active,imported_key:null,name_unconfirmed:!r?.surname});}
 return people.sort((a,b)=>Number(!!a.name_unconfirmed)-Number(!!b.name_unconfirmed)||(a.surname||'').localeCompare(b.surname||'','it',{sensitivity:'base'})||(a.given_name||'').localeCompare(b.given_name||'','it',{sensitivity:'base'}));
}
export function periodWeeks(month){const r=monthRange(month),out=[];for(const day of r.days){const w=weekRange(day);if(!out.some(x=>x.start===w.start))out.push({...w,monthDays:w.days.filter(x=>x.startsWith(month))});}return out;}
export function indexState(state){state.cellCache=new Map();return state;}
export function assignment(state,p,day){if(p.site!=='N153')return {included:true,workplace:p.site};return effective(state.assignments.filter(x=>x.person_key===p.person_key),day);}
export function sheetFor(state,p,day){return latestSheet(state.documents,p.account_id,day,p.imported_key||p.person_key);}
export function cell(state,p,day,today){
 const key=p.person_key+'|'+day+'|'+today;if(state.cellCache?.has(key))return state.cellCache.get(key);
 const record=state.records.find(r=>r.person_key===p.person_key&&r.day===day),sheet=sheetFor(state,p,day),a=assignment(state,p,day);
 const valid=day<=today&&!!record?.confirmed&&(!record.document_id||record.document_id===sheet?.id);
 const ordinary=valid?(record.allocations||[]).reduce((s,x)=>s+Number(x.ordinary),0):0,extra=valid?(record.allocations||[]).reduce((s,x)=>s+Number(x.overtime),0):0;
 const result={day,record,sheet,valid,ordinary,extra,worked:ordinary+extra,absence:valid?record.absence_minutes||0:0,justification:valid?record.justification||'':'',expected:scheduled(state.configs[p.person_key],day),assignment:a,status:day>today?'future':a?.included===false&&!record?'excluded':valid?'verified':record?'stale':sheet?'received':'missing'};state.cellCache?.set(key,result);return result;
}
export function fingerprint(state,p,days,today){return JSON.stringify(days.map(day=>{const c=cell(state,p,day,today);return [day,c.valid,c.record?.version||0,c.record?.document_id||null,c.sheet?.id||null,c.worked,c.absence,c.justification];}));}
export function workerPeriod(state,p,days,today){const cells=days.map(d=>cell(state,p,d,today));return {cells,worked:cells.reduce((n,c)=>n+c.worked,0),ordinary:cells.reduce((n,c)=>n+c.ordinary,0),extra:cells.reduce((n,c)=>n+c.extra,0),complete:cells.every(c=>c.valid||c.status==='excluded'),missing:cells.filter(c=>!c.valid&&c.status!=='excluded').length};}
export function summarizeSite(state,site,workplace,days,today){
 const people=state.people.filter(p=>p.site===site);let budget=0,actual=0,missing=0,unknown=0,unassigned=0;
 for(const day of days){
  let dayBudget=0;
  for(const p of people){const c=cell(state,p,day,today),a=c.assignment;
   if(!a){unassigned++;continue;}if(!a.included)continue;
   const own=a.workplace===workplace;
   if(own){if(c.expected===null)unknown++;else dayBudget+=c.expected;if(!c.valid)missing++;}
   if(c.valid)actual+=(c.record.allocations||[]).filter(x=>x.workplace===workplace).reduce((s,x)=>s+x.ordinary+x.overtime,0);
  }
  const override=state.calendar.find(x=>x.day===day&&x.workplace===workplace);budget+=override?override.minutes:dayBudget;
 }
 const confirmed=state.checks.some(x=>x.site===site&&x.month===days[0]?.slice(0,7)&&x.confirmed);
 const complete=days.every(d=>d<=today)&&!missing&&!unknown&&!unassigned&&confirmed;
 return {budget,actual,difference:actual-budget,missing,unknown,unassigned,complete,confirmed,future:days.some(d=>d>today)};
}
export function totalSites(rows){return {budget:rows.reduce((n,r)=>n+r.budget,0),actual:rows.reduce((n,r)=>n+r.actual,0),difference:rows.reduce((n,r)=>n+r.difference,0),complete:rows.every(r=>r.complete)};}
