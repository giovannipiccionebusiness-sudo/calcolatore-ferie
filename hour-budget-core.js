import {dec,date} from './leave-core.js';
export function minutes(v){const n=dec(String(v).replace(',','.')).times(60);if(!n.isInteger()||n.lt(0)||n.gt(1440))throw Error('Usa ore decimali valide, precise al minuto (es. 1,5 = 1 ora e 30).');return n.toNumber();}
export const hours=n=>dec(n).div(60).toFixed(2).replace('.',',');
export function effective(rows,day){return rows.filter(r=>(r.valid_from||r.from)<=day).sort((a,b)=>(b.valid_from||b.from).localeCompare(a.valid_from||a.from))[0];}
export function scheduled(config,day){const s=effective(config?.schedules||[],day);if(!s?.confirmed)return null;const override=config?.day_overrides?.find(x=>x.day===day);return minutes(override?override.hours:s.hours[(date(day).getUTCDay()+6)%7]);}
export function latestSheet(documents,account,day){return documents.filter(d=>d.worker_id===account&&d.month===day.slice(0,7)&&d.category==='presenze'&&d.review_status!=='rejected'&&(['final'].includes(d.stage)||(['weekly','replacement'].includes(d.stage)&&d.week_ending>=day))).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];}
export function assemblePeople(imported,accounts,registry){
 const people=[],aliases=[],keys=new Set();
 for(const p of imported){const hire=registry.find(r=>r.account_id&&r.account_id===p.account_id);const key=hire?.person_key||p.person_key;if(keys.has(key))continue;keys.add(key);people.push({...p,person_key:key,imported_key:p.person_key,new_hire:!!hire});if(hire)aliases.push({from:p.person_key,to:key});}
 for(const r of registry.filter(r=>r.account_id)){if(keys.has(r.person_key))continue;const a=accounts.find(a=>a.id===r.account_id);if(!a)continue;keys.add(r.person_key);people.push({person_key:r.person_key,account_id:r.account_id,surname:a.full_name,given_name:'',site:'N153',new_hire:true});}
 return {people,aliases};
}
export function registryWarnings({people,accounts=[],assignments,days,aliases=[]}){
 const out=[],linked=new Set(people.map(p=>p.account_id).filter(Boolean));
 for(const a of accounts.filter(a=>a.site==='N153'&&!linked.has(a.id)))out.push('Account da collegare o aggiungere come nuovo assunto: '+a.full_name);
 for(const p of people)if(days.some(day=>!effective(assignments.filter(a=>a.person_key===p.person_key),day)))out.push('Sede/inclusione da verificare: '+p.surname+' '+p.given_name);
 for(const a of aliases)if(assignments.some(x=>x.person_key===a.from))out.push('Assegnazioni precedenti da riallineare dopo associazione al report: '+a.from);
 return out;
}
export function dailyBudget({people,accounts=[],configs,assignments,records,documents=[],calendar=[],day,workplace,rosterConfirmed=false,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()),aliases=[]}){
 date(day);let budget=0,actual=0;const future=day>today,issues=[],details=[];
 const globalIssues=registryWarnings({people,accounts,assignments,days:[day],aliases});if(!rosterConfirmed)globalIssues.push('Organico del periodo da confermare');
 for(const p of people){const a=effective(assignments.filter(a=>a.person_key===p.person_key),day);if(!a?.included)continue;
 const expected=scheduled(configs[p.person_key],day),r=records.find(r=>r.person_key===p.person_key&&r.day===day);const allocations=r?.allocations||[],own=a.workplace===workplace;
 const incoming=allocations.some(x=>x.workplace===workplace&&(x.ordinary+x.overtime)>0);if(!own&&!incoming)continue;
 if(own&&expected===null)issues.push('Orario mancante: '+p.surname);if(own)budget+=expected||0;
 const sheet=latestSheet(documents,p.account_id,day),valid=!!r&&(!r.document_id||r.document_id===sheet?.id)&&r.confirmed;
 if(!future&&!valid)issues.push((r?'Presenze da riconfermare: ':'Presenze mancanti: ')+p.surname+' '+p.given_name);
 const worked=!future&&valid?allocations.filter(x=>x.workplace===workplace).reduce((s,x)=>s+x.ordinary+x.overtime,0):0;actual+=worked;
 details.push({person:p,expected:own?expected:0,worked,record:r,valid,substitute:!own});
 }
 const override=calendar.find(x=>x.day===day&&x.workplace===workplace);if(override)budget=override.minutes;
 const difference=actual-budget;return {budget,actual,difference,issues,globalIssues,details,status:future?'future':issues.length||globalIssues.length?'partial':difference>0?'over':difference<0?'saving':'equal'};
}
