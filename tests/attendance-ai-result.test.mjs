import assert from 'node:assert/strict';
import {validateResult,RESULT_SCHEMA} from '../supabase/functions/attendance-ai/attendance-ai-result.js';
const row={day:2,total_minutes:420,absence_minutes:null,cause:'',uncertain:false};
const sample={month:'2026-10',worker_name:'Esempio',monthly_total_minutes:420,rows:[row]};
assert.equal(validateResult(sample,'2026-10').rows[0].total_minutes,420);
assert.equal(validateResult({...sample,rows:[{...row,total_minutes:null,uncertain:true}]},'2026-10').rows[0].total_minutes,null);
for(const rows of [[],[row,row],[{...row,total_minutes:-1}],[{...row,total_minutes:1441}],[{...row,cause:'unknown'}],[{...row,day:31,total_minutes:60}]])assert.throws(()=>validateResult({...sample,rows},'2026-02'));
assert.equal(RESULT_SCHEMA.additionalProperties,false);
console.log('AI result validation: nulls, invalid hours, duplicate days and month boundaries passed');
