import {consultationKey,weekKey} from './quick-presence-core.js?v=142';
export const remoteMarkKey=(id,period)=>id+':'+period;
export async function saveConsultation(api,actor,document,period){
 const {error}=await api.from('presence_consultations').upsert({admin_id:actor,document_id:document.id,document_month:document.month,period_key:period},{onConflict:'admin_id,document_id,period_key',ignoreDuplicates:true});if(error)throw error;
}
export async function syncConsultations(api,actor,documents,people,month,storage,guard=()=>{}){
 const marks=new Set();
 for(let offset=0;;offset+=200){guard();const {data,error}=await api.from('presence_consultations').select('document_id,period_key').eq('admin_id',actor).eq('document_month',month).order('document_id').order('period_key').range(offset,offset+199);guard();if(error)throw error;for(const r of data)marks.add(remoteMarkKey(r.document_id,r.period_key));if(data.length<200)break;}
 let migrated=0;
 for(const doc of documents){guard();if(doc.review_status==='rejected')continue;const period=doc.stage==='final'?'final':['weekly','replacement'].includes(doc.stage)?weekKey(doc.week_ending):null;if(!period||marks.has(remoteMarkKey(doc.id,period)))continue;
 const person=people.find(p=>p.account_id?doc.worker_id===p.account_id:doc.recipient_person_key===p.person_key);if(!person)continue;
 let local=false;try{local=[doc.month+'/'+period,doc.month].some(scope=>storage?.getItem(consultationKey(actor,scope,person.id,doc))==='1');}catch{}if(!local)continue;
 await saveConsultation(api,actor,doc,period);guard();marks.add(remoteMarkKey(doc.id,period));migrated++;
 }
 return {marks,migrated};
}
