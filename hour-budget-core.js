import {dec,date} from './leave-core.js';
export function minutes(v){const n=dec(String(v).replace(',','.')).times(60);if(!n.isInteger()||n.lt(0)||n.gt(1440))throw Error('Usa ore decimali valide, precise al minuto (es. 1,5 = 1 ora e 30).');return n.toNumber();}
export const hours=n=>dec(n).div(60).toFixed(2).replace('.',',');
export function effective(rows,day){return rows.filter(r=>(r.valid_from||r.from)<=day).sort((a,b)=>(b.valid_from||b.from).localeCompare(a.valid_from||a.from))[0];}
export function scheduled(config,day){const s=effective(config?.schedules||[],day);if(!s?.confirmed)return null;const override=config?.day_overrides?.find(x=>x.day===day);return minutes(override?override.hours:s.hours[(date(day).getUTCDay()+6)%7]);}
export function latestSheet(documents,account,day){return documents.filter(d=>d.worker_id===account&&d.month===day.slice(0,7)&&d.category==='presenze'&&d.review_status!=='rejected'&&(['final'].includes(d.stage)||(['weekly','replacement'].includes(d.stage)&&d.week_ending>=day))).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];}
export function dailyBudget({people,accounts=[],configs,assignments,records,documents=[],calendar=[],day,workplace,rosterConfirmed=false}){
 date(day);let budget=0,actual=0;const issues=[],details=[];if(!rosterConfirmed)issues.push('Organico del periodo da confermare');
 const linked=new Set(people.map(p=>p.account_id).filter(Boolean));for(const a of accounts.filter(a=>a.site==='N153'&&a.active&&!linked.has(a.id)))issues.push('Account non associato: '+a.full_name);
 for(const p of people){const a=effective(assignments.filter(a=>a.person_key===p.person_key),day);if(!a){issues.push('Sede/inclusione da verificare: '+p.surname+' '+p.given_name);continue;}if(!a.included)continue;
 const expected=scheduled(configs[p.person_key],day),r=records.find(r=>r.person_key===p.person_key&&r.day===day);const allocations=r?.allocations||[],own=a.workplace===workplace;
 if(own&&expected===null)issues.push('Orario mancante: '+p.surname);if(own)budget+=expected||0;
 const sheet=latestSheet(documents,p.account_id,day),valid=!!r&&(!r.document_id||r.document_id===sheet?.id)&&r.confirmed;
 // All included people must be reviewed, including rest days, to detect transfers and extra work.
 if(!valid)issues.push((r?'Presenze da riconfermare: ':'Presenze mancanti: ')+p.surname+' '+p.given_name);
 const worked=valid?allocations.filter(x=>x.workplace===workplace).reduce((s,x)=>s+x.ordinary+x.overtime,0):0;actual+=worked;
 if(own||worked)details.push({person:p,expected:own?expected:0,worked,record:r,valid});
 }
 const override=calendar.find(x=>x.day===day&&x.workplace===workplace);if(override)budget=override.minutes;
 const difference=actual-budget;return {budget,actual,difference,issues,details,status:issues.length?'partial':difference>0?'over':difference<0?'saving':'equal'};
}
