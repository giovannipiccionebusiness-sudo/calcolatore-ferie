import assert from 'node:assert/strict';
import {cell,sheetFor,indexState} from '../presence-core.js';
const p={person_key:'p',account_id:'a',site:'N154'},doc=(id,end,stage='weekly')=>({id,worker_id:'a',month:'2026-10',category:'presenze',stage,week_ending:end,review_status:'pending',created_at:id==='new'?'2026-10-30T10:00Z':'2026-10-23T10:00Z'});
function state(extra={}){return indexState({records:[],documents:[doc('old','2026-10-23'),doc('new','2026-10-30')],assignments:[],configs:{p:{schedules:[{from:'2026-10-01',confirmed:true,hours:[4,4,4,4,4,0,0]}]}},autoJobs:[{document_id:'old'},{document_id:'new'}],autoRows:[{document_id:'old',day:'2026-10-20',reading:{total_minutes:420,uncertain:false,cause:''}},{document_id:'new',day:'2026-10-27',reading:{total_minutes:220,uncertain:false,cause:''}}],...extra});}
let s=state();assert.equal(sheetFor(s,p,'2026-10-20').id,'old');assert.equal(sheetFor(s,p,'2026-10-27').id,'new');
let c=cell(s,p,'2026-10-20','2026-10-31');assert.equal(c.status,'provisional');assert.equal(c.proposal.ordinary,240);assert.equal(c.proposal.supplementary,180);assert.equal(c.worked,0);assert.equal(c.valid,false);
c=cell(s,p,'2026-10-27','2026-10-31');assert.equal(c.proposal.ordinary,220);assert.equal(c.proposal.supplementary,0);
const record={person_key:'p',day:'2026-10-20',document_id:'old',confirmed:true,allocations:[{ordinary:230,overtime:0,workplace:'N154'}]};c=cell(state({records:[record]}),p,'2026-10-20','2026-10-31');assert.equal(c.valid,true);assert.equal(c.ordinary,230);assert.equal(c.proposal,null);
c=cell(state({configs:{}}),p,'2026-10-20','2026-10-31');assert.equal(c.status,'ai-review');assert.equal(c.proposal.ordinary,null);
c=cell(state(),p,'2026-10-27','2026-10-26');assert.equal(c.proposal,null);assert.equal(c.status,'future');
const final=doc('new',null,'final');s=state({documents:[doc('old','2026-10-23'),final],autoRows:[{document_id:'new',day:'2026-10-20',reading:{total_minutes:null,uncertain:true,cause:'F'}}]});c=cell(s,p,'2026-10-20','2026-10-31');assert.equal(c.status,'ai-review');assert.equal(c.proposal.cause,'F');assert.equal(c.proposal.ordinary,null);
console.log('Passed: automatic O/S, separate weeks, final precedence, confirmed edits preserved, future/unknown contract blocked, no provisional hours in verified totals.');
