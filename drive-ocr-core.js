// Conservative evidence parsing. Never repair handwritten digits from a planned shift.
export const PILOT_WORKER='60d6c259-e421-474b-9c5c-cc1d641e32d5';
export function clockMinutes(value){const m=String(value).trim().match(/^(\d{1,2})[:.,](\d{2})$/);if(!m||+m[1]>24||+m[2]>59||(+m[1]===24&&+m[2]!==0))throw Error('Usa ore e minuti, es. 4:00 o 1:20.');return +m[1]*60 + +m[2];}
export const hm=n=>Number.isInteger(n)?Math.floor(n/60)+':'+String(n%60).padStart(2,'0'):'';
export function readEvidence(text){
 const raw=String(text||''),lines=raw.replace(/_/g,'').split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean);
 if(!lines.length)return {raw,total:null,cause:'',reason:'Nessuna lettura: non equivale a zero.'};
 if(/\b(?:TOTALE|NOTE)\s*:/i.test(raw)){
  const clean=raw.replace(/_/g,'').replace(/\r/g,'');
  const value=label=>{const escaped=label.replace(/ /g,'[ \t]+');const m=clean.match(new RegExp('(?:^|\\n)'+escaped+'[ \t]*:[ \t]*(?:\\n[ \t]*)?([0-9]{1,2}(?:[:., ][0-9]{2})?)[ \t]*(?=\\n|$)','i'));return m?.[1]??null;};
  let total=null,intervalTotal=null,incomplete=false;
  try{const t=value('TOTALE');if(t&&/[:., ]/.test(t))total=clockMinutes(t.replace(' ',':'));}catch{}
  let sum=0,found=false;for(const prefix of ['', 'SECONDO ']){const parts=['INIZIO ORA','INIZIO MINUTI','FINE ORA','FINE MINUTI'].map(k=>value(prefix+k));if(parts.every(p=>p===null))continue;if(parts.some(p=>p===null)){incomplete=true;continue;}try{const a=clockMinutes(parts[0]+':'+parts[1].padStart(2,'0')),b=clockMinutes(parts[2]+':'+parts[3].padStart(2,'0'));if(b<=a)throw Error();sum+=b-a;found=true;}catch{incomplete=true;}}
  if(found&&!incomplete)intervalTotal=sum;
  const note=clean.match(/(?:^|\n)NOTE\s*:\s*([\s\S]*)$/i)?.[1]||'';
  const causes=[[/\bFERIE\b/i,'F'],[/\bMALATTIA\b/i,'M'],[/\b(?:L\s*)?104\b/i,'L104'],[/\b(?:PHR|ROL)\b/i,'PHR'],[/\bCONGEDO\b/i,'congedo parentale']].filter(([pattern])=>pattern.test(note));const cause=causes.length===1?causes[0][1]:'';
  return {raw,total,intervalTotal,cause,reason:total===null?'Lettura dubbia: controlla il ritaglio.':intervalTotal!==null&&total!==intervalTotal?'Totale e fasce non coincidono.':intervalTotal===null?'Totale proposto: fasce non verificate.':'Totale e fasce coincidono; verifica il giorno.'};
 }

 if(lines.length===1&&/^FERIE$/i.test(lines[0]))return {raw,total:null,cause:'F',reason:'Ferie lette: controlla giorno e ore di assenza.'};
 let total=null,intervalTotal=null;
 // Cell OCR may return one token per line, including a final total such as "5 20".
 if(lines.length===5&&lines.slice(0,4).every(s=>/^\d{1,2}$/.test(s))){
  try{const start=clockMinutes(lines[0]+':'+lines[1].padStart(2,'0')),end=clockMinutes(lines[2]+':'+lines[3].padStart(2,'0'));if(start<end)intervalTotal=end-start;}catch{}
 }
 const last=lines.at(-1)?.replace(/^(\d{1,2}) +(\d{2})$/,'$1:$2');
 if(/^\d{1,2}[:.,]\d{2}$/.test(last||'')){try{total=clockMinutes(last);}catch{}}
 return {raw,total,cause:'',intervalTotal,reason:total===null?'Lettura dubbia: controlla il ritaglio.':intervalTotal!==null&&total!==intervalTotal?'Totale e fascia non coincidono.':intervalTotal===null?'Totale proposto: fascia non verificata.':'Totale e fascia coincidono; verifica il giorno.'};
}
export function shiftFor(shifts,day){const s=shifts.filter(s=>s.valid_from<=day).sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0];if(!s)return {minutes:null,version:null};try{const intervals=s.schedule[(new Date(day+'T12:00:00Z').getUTCDay()+6)%7]||[];let n=0;for(const i of intervals){const a=clockMinutes(i.start),b=clockMinutes(i.end);if(b<=a)throw Error();n+=b-a;}return {minutes:n,version:s.version,shift:s};}catch{return {minutes:null,version:s.version};}}
export function declared(declaration,contract){if(!declaration||contract===null)return null;const absence=declaration.absence_scope==='full'?contract:declaration.absence_scope==='partial'?declaration.absence_minutes:0;if(!Number.isInteger(absence)||absence<0||absence>contract)return null;return {ordinary:contract-absence,extra:declaration.supplementary_minutes,absence,cause:declaration.cause||'',total:contract-absence+declaration.supplementary_minutes};}
export function comparison(proposal,current){if(!current)return 'Giornata non inserita nell’app';if(proposal.total===null&&!proposal.cause)return 'Lettura da verificare';if(proposal.cause&&proposal.cause!==current.cause)return 'Giustificativo diverso';if(proposal.total!==null&&proposal.total!==current.total)return 'Ore diverse';if(current.cause&&!proposal.cause)return 'Giustificativo dell’app da verificare';return 'Dati compatibili · da confermare';}
// Detect a candidate grid from long horizontal lines. All day labels remain unverified
// until an administrator inspects the overlay and explicitly confirms it.
export function detectGrid({data,width,height}){
 if(width<150||height<300)return null;
 const x0=Math.floor(width*.10),x1=Math.floor(width*.91),span=x1-x0,scores=new Float32Array(height);
 for(let y=0;y<height;y++){let dark=0;for(let x=x0;x<x1;x++){const i=(y*width+x)*4;if(data[i]*.299+data[i+1]*.587+data[i+2]*.114<170)dark++;}scores[y]=dark/span;}
 const candidates=[];for(let y=Math.floor(height*.16);y<height*.83;y++){let value=scores[y];if(value>.38&&value>=scores[y-1]&&value>=scores[y+1]){const old=candidates.at(-1);if(old&&y-old.y<4){if(value>old.score)candidates[candidates.length-1]={y,score:value};}else candidates.push({y,score:value});}}
 let best=null;
 for(const first of candidates.filter(c=>c.y>height*.20&&c.y<height*.48))for(let step=height*.011;step<height*.025;step+=.1){
  if(first.y+31*step>height*.91)continue;
  const edges=[];let score=0;for(let i=0;i<=31;i++){const target=first.y+i*step;let hit=null;for(const c of candidates)if(Math.abs(c.y-target)<step*.24&&(!hit||c.score>hit.score))hit=c;if(!hit)break;edges.push(hit.y);score+=hit.score;}
  if(edges.length!==32)continue;
  // A two-line header precedes the first data row; an intermediate horizontal
  // line does not span the day column. This helps avoid shifting every date.
  const peak=y=>Math.max(...Array.from({length:5},(_,j)=>scores[Math.round(y)+j-2]||0));
  const prior=peak(first.y-step),header=peak(first.y-2*step);
  if(prior<.3||header-prior<.10)continue;
  score+=header-prior;
  if(!best||score>best.score)best={score,edges,step};
 }
 if(!best)return null;
 // Estimate the left and right table edges from the detected horizontal lines.
 const strengths=new Float32Array(width);for(let x=0;x<width;x++){let count=0;for(const y of best.edges){let hit=false;for(let dy=-1;dy<=1;dy++){const i=((y+dy)*width+x)*4;if(i>=0&&i<data.length&&data[i]+data[i+1]+data[i+2]<540)hit=true;}if(hit)count++;}strengths[x]=count/32;}
 const good=[];for(let x=0;x<width;x++)if(strengths[x]>.65)good.push(x);
 const left=good.find(x=>x>width*.02)??x0,right=[...good].reverse().find(x=>x<width*.98)??x1;
 if(right-left<width*.45)return null;
 return {left,right,top:best.edges[0],bottom:best.edges[31],edges:best.edges,score:best.score/32,verified:false};
}
