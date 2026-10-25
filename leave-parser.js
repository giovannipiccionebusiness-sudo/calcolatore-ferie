import {unzipSync,strFromU8} from './vendor/fflate.js';
import {dec,norm,monthEnd} from './leave-core.js';
const all=(node,name)=>[...node.getElementsByTagNameNS('*',name)];
function xml(raw){const doc=new DOMParser().parseFromString(raw,'application/xml');if(all(doc,'parsererror').length)throw Error('XML del report non valido');return doc;}
export async function parseReport(buffer,fileName='report.xlsx'){
 if(buffer.byteLength>8*1024*1024)throw Error('File troppo grande (massimo 8 MB)');let size=0,count=0;const zip=unzipSync(new Uint8Array(buffer),{filter:f=>{if(++count>1500||(size+=f.originalSize)>30*1024*1024)throw Error('Archivio Excel troppo grande');return /^(xl\/|\[Content_Types\])/.test(f.name);}});
 const text=path=>{if(!zip[path])throw Error('Foglio Excel mancante: '+path);return strFromU8(zip[path]);};
 const workbook=xml(text('xl/workbook.xml')),rels=xml(text('xl/_rels/workbook.xml.rels')),relationships=new Map(all(rels,'Relationship').map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
 const strings=zip['xl/sharedStrings.xml']?all(xml(text('xl/sharedStrings.xml')),'si').map(si=>all(si,'t').map(t=>t.textContent).join('')):[];
 const sheets=all(workbook,'sheet').map(s=>({name:s.getAttribute('name'),path:new URL(relationships.get(s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')),'https://xlsx.local/xl/').pathname.slice(1)}));
 function cells(sheet){const rows=new Map();for(const cell of all(xml(text(sheet.path)),'c')){const address=cell.getAttribute('r'),v=all(cell,'v')[0]?.textContent,kind=cell.getAttribute('t');let value=kind==='s'?strings[Number(v)]:kind==='inlineStr'?all(cell,'t').map(t=>t.textContent).join(''):v;if(value==null)continue;const row=Number(address.match(/\d+/)?.[0]);if(!rows.has(row))rows.set(row,{});rows.get(row)[address.replace(/\d/g,'')]=value;}return rows;}
 const prompt=sheets.find(s=>norm(s.name).includes('RIEPILOGO PROMPT'));if(!prompt)throw Error('Manca il foglio Riepilogo Prompt');const promptRows=cells(prompt);let period;
 for(const row of promptRows.values()){const values=Object.values(row);if(values.some(v=>norm(v)==='PERIODO CHIUSO'))period=values.find(v=>/^20\d{4}$/.test(v));}
 if(!period||!/^20\d{2}(0[1-9]|1[0-2])$/.test(period))throw Error('Periodo Chiuso non riconosciuto nel Riepilogo Prompt');const end=monthEnd(period.slice(0,4)+'-'+period.slice(4));
 let selected;const warnings=[];
 for(const sheet of sheets.filter(s=>s!==prompt)){const rows=cells(sheet);let header,group;
  for(const [number,row] of rows){const vals=Object.values(row).map(norm);if(vals.includes('COGNOME')&&vals.includes('NOME')&&vals.includes('FERIE GG')&&vals.includes('ROL GG')){header={number,row};break;}}
  if(!header)continue;
  const headers=Object.entries(header.row),col=label=>headers.find(([,v])=>norm(v)===label)?.[0];
  for(const [number,row] of rows)if(number<header.number&&Object.values(row).some(v=>/RESIDUI ASSENZA EFFET/.test(norm(v))))group=row;
  if(!group)throw Error('Sezione Residui assenza effettiva non trovata');
  const ferie=col('FERIE GG'),rol=col('ROL GG'),ex=col('EX FESTIVITA GG');
  const letters=n=>n.split('').reduce((a,c)=>a*26+c.charCodeAt(0)-64,0);const groups=Object.entries(group).filter(([,v])=>/RESIDUI ASSENZA EFFET/.test(norm(v)));if(!groups.some(([start])=>letters(ferie)>=letters(start)&&letters(rol)>=letters(start)))throw Error('Colonne saldi non appartenenti all’assenza effettiva');
  const parsed=[];for(const [number,row] of rows){if(number<=header.number||!row[col('MATR')]||!row[col('COGNOME')]||!row[col('NOME')])continue;const rawF=row[ferie],rawR=row[rol],rawEx=ex?row[ex]:'0';if(rawF==null&&rawR==null&&rawEx==null){warnings.push('Riga '+number+': saldi assenti, non importata');continue;}if(rawF==null||rawR==null||rawEx==null)throw Error('Saldo mancante alla riga '+number);parsed.push({person_key:'DUSSMANN:'+String(row[col('MATR')]).trim(),matricola:String(row[col('MATR')]),surname:row[col('COGNOME')],given_name:row[col('NOME')],site:row[col('APPALTO')]||'',ferie:dec(rawF).toString(),rol:dec(rawR).toString(),ex_festivita:dec(rawEx).toString(),source_row:number,source_sheet:sheet.name,raw:{ferie:rawF,rol:rawR,ex_festivita:rawEx}});}
  if(selected)throw Error('Più fogli individuali compatibili: verifica manuale necessaria');selected=parsed;
 }
 if(!selected?.length)throw Error('Nessun saldo individuale riconosciuto');if(new Set(selected.map(r=>r.person_key)).size!==selected.length)throw Error('Matricole duplicate nel foglio individuale');
 const canonical=JSON.stringify({period:end,rows:[...selected].sort((a,b)=>a.person_key.localeCompare(b.person_key)).map(({person_key,ferie,rol,ex_festivita})=>({person_key,ferie,rol,ex_festivita}))});
 const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {period:end,file_name:fileName,checksum,warnings,rows:selected};
}
