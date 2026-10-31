import assert from 'node:assert/strict';
import {projection,rowBounds} from '../attendance-row-geometry.js';
import {validateResult} from '../supabase/functions/attendance-ai/attendance-ai-intervals.js';
const corners=[{x:70,y:607},{x:592,y:625},{x:618,y:1068},{x:45,y:1062}],map=projection(corners);
for(const [i,[u,v]]of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]]){const p=map(u,v);assert.ok(Math.abs(p.x-corners[i].x)<1e-6);assert.ok(Math.abs(p.y-corners[i].y)<1e-6);}
assert.throws(()=>projection([corners[0],corners[2],corners[1],corners[3]]));
const lines=Array.from({length:32},(_,i)=>i*30);assert.deepEqual(rowBounds(lines,3),{top:60,bottom:90});assert.deepEqual(rowBounds(lines,31),{top:900,bottom:930});assert.throws(()=>rowBounds([0,0,...lines.slice(2)],2));
const blank=day=>({day,printed_day:day,entry_1:null,exit_1:null,entry_2:null,exit_2:null,row_state:'blank',cause:'',absence_text:null,uncertain:false});
const rows=Array.from({length:31},(_,i)=>blank(i+1));
// Samantha's reported failures: barred 3,4,11,17,18,24 must not produce work.
for(const day of [3,4,11,17,18,24])Object.assign(rows[day-1],{entry_1:'08:00',exit_1:'13:00'});
Object.assign(rows[8],{row_state:'worked',entry_1:'13:30',exit_1:'17:10'});
Object.assign(rows[11],{row_state:'worked',entry_1:'12:00',exit_1:'17:10'});
Object.assign(rows[26],{row_state:'absence',cause:'F'});
// Wrong printed day blocks even a plausible full interval.
Object.assign(rows[19],{row_state:'worked',printed_day:21,entry_1:'13:30',exit_1:'17:10'});
const data={month:'2026-10',worker_name:'Test',monthly_total_text:null,rows};const result=validateResult(structuredClone(data),'2026-10',true);
for(const day of [3,4,11,17,18,24,20])assert.equal(result.rows[day-1].total_minutes,null);
assert.equal(result.rows[8].total_minutes,220);assert.equal(result.rows[11].total_minutes,310);assert.equal(result.rows[26].cause,'F');assert.equal(result.method,'isolated-rows');
assert.throws(()=>validateResult({...data,rows:rows.slice(0,30)},'2026-10',true));
console.log('Passed: perspective corners, row boundaries, barred rows, printed-day mismatch, 220/310 minute durations, F, missing row rejection. These tests do not measure model OCR accuracy.');
