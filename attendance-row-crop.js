import {projection,rowBounds} from './attendance-row-geometry.js?v=78';
import {detectAttendanceTable} from './attendance-table-detect.js?v=79';
const el=(t,s)=>{const n=document.createElement(t);if(s)n.textContent=s;return n;};
async function pageCanvas(blob){
 if(blob.type==='application/pdf'){
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false});
  try{const pdf=await task.promise;if(pdf.numPages!==1)throw Error('Per la lettura per riga usa un foglio di una sola pagina');const p=await pdf.getPage(1),base=p.getViewport({scale:1}),view=p.getViewport({scale:Math.min(4,2400/base.width)}),c=el('canvas');c.width=Math.ceil(view.width);c.height=Math.ceil(view.height);await p.render({canvasContext:c.getContext('2d'),viewport:view,background:'white'}).promise;return c;}finally{await task.destroy();}
 }
 const bitmap=await createImageBitmap(blob);try{const c=el('canvas'),s=Math.min(1,2800/Math.max(bitmap.width,bitmap.height));c.width=Math.round(bitmap.width*s);c.height=Math.round(bitmap.height*s);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);return c;}finally{bitmap.close();}
}
function rectify(page,points,rowHeight=null,pixels=null){
 const map=projection(points),c=el('canvas');c.width=1200;
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);c.height=Math.max(620,Math.min(2400,Math.round(c.width*(distance(points[0],points[3])+distance(points[1],points[2]))/(distance(points[0],points[1])+distance(points[2],points[3])))));
 if(rowHeight!==null)c.height=rowHeight;
 const src=pixels||page.getContext('2d').getImageData(0,0,page.width,page.height),ctx=c.getContext('2d'),out=ctx.createImageData(c.width,c.height);
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const p=map(x/(c.width-1),y/(c.height-1)),sx=Math.max(0,Math.min(page.width-1,Math.round(p.x))),sy=Math.max(0,Math.min(page.height-1,Math.round(p.y))),from=(sy*page.width+sx)*4,to=(y*c.width+x)*4;out.data.set(src.data.subarray(from,from+4),to);}ctx.putImageData(out,0,0);return c;
}
export async function selectAttendanceRows(blob){
 const page=await pageCanvas(blob);
 return new Promise((resolve,reject)=>{
  const d=el('dialog'),title=el('h2','Tabella e righe del foglio'),note=el('p'),area=el('div'),actions=el('div'),status=el('p'),canvas=el('canvas');let points=[],table=null,lines=[],rows=null,finished=false,drag=null,automatic=false;
  d.style.cssText='width:min(1000px,96vw);max-height:94dvh;overflow:auto;border:0;border-radius:20px;padding:20px;color:#173f3a';
  const close=el('button','×');close.type='button';close.setAttribute('aria-label','Chiudi selezione righe');close.style.cssText='float:right;font-size:28px;border:0;background:transparent';close.onclick=()=>d.close();
  canvas.style.cssText='display:block;width:100%;height:auto;touch-action:none;border:1px solid #bdd8cf';area.append(canvas);d.append(close,title,note,area,status,actions);document.body.append(d);
  const addButton=(text,fn)=>{const b=el('button',text);b.type='button';b.className='doc-button outline';b.onclick=fn;actions.append(b);return b;};
  function draw(){const src=table||page;canvas.width=src.width;canvas.height=src.height;canvas.style.width=Math.min(Math.max(200,d.clientWidth-44),Math.max(280,innerHeight*.70)*src.width/src.height)+'px';const ctx=canvas.getContext('2d');ctx.drawImage(src,0,0);ctx.strokeStyle='#d32828';ctx.lineWidth=Math.max(2,canvas.width/500);ctx.fillStyle='#d32828';
   if(table){ctx.font='bold 18px sans-serif';lines.forEach((y,i)=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();if(i<31)ctx.fillText(String(i+1),canvas.width-30,(y+lines[i+1])/2+6);});}
   else points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,Math.max(5,canvas.width/100),0,7);ctx.fill();ctx.font='bold 26px sans-serif';ctx.fillText(String(i+1),p.x+12,p.y);});
  }
  function reset(){automatic=false;points=[];table=null;rows=null;lines=[];area.replaceChildren(canvas);actions.replaceChildren();note.textContent='Tocca i quattro angoli del SOLO corpo giornaliero: 1 alto sinistra prima del giorno 1; 2 alto destra; 3 basso destra dopo il giorno 31; 4 basso sinistra. Escludi intestazioni e TOTALE MESE. Includi GG, orari e causali.';addButton('Ingrandisci foglio',()=>canvas.style.width='100%');addButton('Ricomincia selezione',reset);draw();status.textContent='Angolo 1 di 4';}
  function align(){table=rectify(page,points);lines=Array.from({length:32},(_,i)=>i*(table.height-1)/31);note.textContent='Allinea le linee rosse ai bordi delle righe stampate trascinandole. Il numero rosso deve corrispondere al GG nero del foglio. Se i numeri non coincidono, correggi i bordi o ricomincia.';actions.replaceChildren();addButton('Ricomincia dagli angoli',reset);addButton('Mostra i 31 ritagli',preview);draw();status.textContent='Controlla soprattutto righe barrate e causali di assenza.';}
  function preview(){
   rows=[];const list=el('div');for(let day=1;day<=31;day++){const {top,bottom}=rowBounds(lines,day),c=el('canvas');c.width=1200;c.height=Math.max(1,Math.round(bottom-top));c.getContext('2d').drawImage(table,0,top,table.width,bottom-top,0,0,c.width,c.height);const image=c.toDataURL('image/jpeg',.9);rows.push({day,image});const item=el('div'),label=el('strong','Giorno '+day),img=el('img');img.src=image;img.alt='Ritaglio originale del giorno '+day;img.style.cssText='display:block;width:100%;margin:8px 0 18px;border:1px solid #cbded8';item.append(label,img);list.append(item);}
   area.replaceChildren(list);actions.replaceChildren();note.textContent=(automatic?'Riconoscimento automatico completato. ':'')+'Confronta ogni etichetta con il numero GG visibile nel ritaglio. Ogni immagine deve contenere una sola riga completa. I ritagli restano locali fino a quando confermi l’invio IA.';const label=el('label','Ho controllato: tutti i ritagli corrispondono al giorno indicato e non includono le righe vicine'),check=el('input');check.type='checkbox';check.style.width='auto';label.prepend(check);actions.append(label);addButton('Correggi i confini',()=>{area.replaceChildren(canvas);actions.replaceChildren();addButton('Selezione manuale della tabella',reset);addButton('Mostra i 31 ritagli',preview);draw();});const send=addButton('Conferma ritagli e avvia lettura IA',()=>{if(!check.checked)return;if(rows.reduce((n,r)=>n+r.image.length,0)>4*1024*1024){status.textContent='Ritagli oltre 4 MB: riduci la foto';return;}finished=true;resolve(rows);d.close();});send.disabled=true;check.onchange=()=>send.disabled=!check.checked;status.textContent=(automatic?'Tabella e 31 righe rilevate automaticamente. ':'')+'Nessuna lettura IA ancora eseguita.';
  }
  const position=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
  canvas.onpointerdown=e=>{const p=position(e);if(!table){points.push(p);if(points.length===4){try{align();}catch(err){status.textContent=err.message;points=[];draw();}}else{draw();status.textContent='Angolo '+(points.length+1)+' di 4';}}else{drag=lines.reduce((best,y,i)=>Math.abs(y-p.y)<Math.abs(lines[best]-p.y)?i:best,0);canvas.setPointerCapture(e.pointerId);}};
  canvas.onpointermove=e=>{if(drag===null||!table)return;const p=position(e);lines[drag]=Math.max(drag?lines[drag-1]+4:0,Math.min(drag<31?lines[drag+1]-4:table.height-1,p.y));draw();};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
  d.addEventListener('close',()=>{page.width=page.height=1;if(table)table.width=table.height=1;d.remove();if(!finished)reject(Error('Selezione righe annullata: nessuna chiamata IA eseguita'));});d.showModal();reset();
  status.textContent='Riconoscimento automatico della tabella e delle righe in corso…';
  requestAnimationFrame(()=>setTimeout(()=>{
   if(!d.isConnected)return;
   try{
    const sample=el('canvas'),scale=Math.min(1,900/page.width,1800/page.height);sample.width=Math.round(page.width*scale);sample.height=Math.round(page.height*scale);const ctx=sample.getContext('2d');ctx.drawImage(page,0,0,sample.width,sample.height);
    const grid=detectAttendanceTable(ctx.getImageData(0,0,sample.width,sample.height));sample.width=sample.height=1;
    if(!grid||grid.confidence<.78){status.textContent='La griglia non è abbastanza chiara per un ritaglio automatico affidabile. Seleziona gli angoli oppure usa una foto più dritta e nitida.';return;}
    const factor=1/scale,source=grid.lines.map(l=>({left:{x:l.left.x*factor,y:l.left.y*factor},right:{x:l.right.x*factor,y:l.right.y*factor}}));
    table=el('canvas');table.width=1200;table.height=31*40;const target=table.getContext('2d'),pixels=page.getContext('2d').getImageData(0,0,page.width,page.height);
    for(let i=0;i<31;i++){const a=source[i],b=source[i+1],row=rectify(page,[a.left,a.right,b.right,b.left],40,pixels);target.drawImage(row,0,i*40);row.width=row.height=1;}
    lines=Array.from({length:32},(_,i)=>i*40);automatic=true;preview();
   }catch{reset();status.textContent='Riconoscimento automatico non riuscito: puoi selezionare la tabella manualmente.';}
  },0));
 });
}
