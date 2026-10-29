import assert from 'node:assert/strict';
// Exercise the production render path without a login or real worker data.
class Element{
 constructor(tag,text=''){this.tagName=tag.toUpperCase();this.children=[];this.text=text;this.events={};this.value='';}
 set textContent(v){this.text=v;this.children=[];}
 get textContent(){return this.text+this.children.map(c=>c.textContent??'').join('');}
 append(...nodes){this.children.push(...nodes);}
 prepend(...nodes){this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.text='';this.children=nodes;}
 setAttribute(){} removeAttribute(){}
 addEventListener(name,fn){this.events[name]=fn;}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tagName===tag.toUpperCase()?[c]:[]),...c.querySelectorAll(tag)]);}
}
const operations=new Element('div');globalThis.document={head:new Element('head'),createElement:t=>new Element(t),getElementById:()=>operations};globalThis.Option=class extends Element{constructor(text,value){super('option',text);this.value=value;}};
const {N153_WORKPLACES}=await import('../workplaces.js');
const profile={active:true,role:'admin'},person={person_key:'fake',surname:'Fittizio',given_name:'Test',site:'N153'};
const config={schedules:[{from:'2020-01-01',hours:['3.66','3.66','3.66','3.66','3.66','0','0'],confirmed:true}]};
globalThis.fetch=async(url,opts)=>({ok:true,json:async()=>JSON.parse(opts.body).action==='roster'?{people:[person],accounts:[]}:{config}});
const client={from(table){return {select(){return this},order(){return this},gte(){return this},lte(){return this},eq(){return this},async range(){return {data:table==='hour_budget_assignments'?[{person_key:'fake',valid_from:'2020-01-01',included:true,workplace:N153_WORKPLACES[0]}]:[]};}};}};
const {createHourBudget}=await import('../hour-budget-ui.js');const ctl=createHourBudget({getClient:()=>client,getSession:()=>({user:{id:'fake-admin'},access_token:'fake'}),getProfile:()=>profile});ctl.refresh();const panel=operations.children[0];panel.open=true;panel.events.toggle();
for(let i=0;i<100;i++){if(panel.textContent.includes('Operazione completata.'))break;await new Promise(r=>setImmediate(r));}
assert.ok(panel.textContent.includes('Operazione completata.'),panel.textContent);assert.ok(panel.textContent.includes('Riepilogo settimanale'));assert.ok(panel.textContent.includes('Ore previste nella settimana: 18,30 h'));assert.ok(panel.textContent.includes('Dettaglio dei giorni'));assert.equal(panel.querySelectorAll('details').filter(e=>e.className?.startsWith('budget-line')).length,7);
console.log('PASS production panel renders weekly total and all seven days with imported 3.66h/day schedule');
