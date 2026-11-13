let library;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
export async function showDocument(load,{name='Documento',context='',allowed=()=>true}={}){
 const previous=document.activeElement,dialog=el('dialog');dialog.className='document-viewer';dialog.setAttribute('aria-label',name);
 if(!document.getElementById('document-viewer-style')){const style=el('style');style.id='document-viewer-style';style.textContent=`
 .document-viewer{box-sizing:border-box;width:min(1100px,calc(100vw - 24px));height:90dvh;max-height:90dvh;padding:0;border:0;border-radius:20px;background:#f4faf7;color:#173f3a;overflow:hidden}
 .document-viewer[open]{display:flex;flex-direction:column}.document-viewer::backdrop{background:#102d32aa}
 .document-viewer header{display:flex;align-items:center;gap:12px;padding:14px;background:white;flex-shrink:0}.document-viewer-heading{flex:1;min-width:0}.document-viewer-context{margin:6px 0 0;color:#126358;font:600 14px system-ui;line-height:1.45;overflow-wrap:anywhere}.document-viewer h2{font:700 18px system-ui;margin:0;flex:1;overflow-wrap:anywhere}
 .document-viewer button,.document-viewer a{box-sizing:border-box;min-height:44px;border:1px solid #b6d7cf;border-radius:10px;padding:8px 12px;background:#fff;color:#08695d;font:600 16px system-ui;cursor:pointer;text-decoration:none}
 .document-viewer button:disabled{opacity:.45}.document-viewer nav{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px;border-bottom:1px solid #cadfd8;flex-shrink:0}
 .document-viewer output{font:14px system-ui}.document-viewer-viewport{overflow:auto;min-height:0;flex:1;overscroll-behavior:contain;touch-action:pan-x pan-y pinch-zoom;background:#dfe8e5;padding:8px}
 .document-viewer-surface{width:max-content;min-width:100%;display:flex;justify-content:center;align-items:flex-start}
 .document-viewer-surface img,.document-viewer-surface canvas{display:block;max-width:none!important;max-height:none!important;flex-shrink:0;background:white}
 .document-viewer-status{padding:0 14px;margin:6px 0;font:14px system-ui}
 `;document.head.append(style);}
 const head=el('header'),title=el('h2',name),close=el('button','✕');close.type='button';close.setAttribute('aria-label','Chiudi documento');close.onclick=()=>dialog.close();const heading=el('div');heading.className='document-viewer-heading';heading.append(title);if(context){const detail=el('p',context);detail.className='document-viewer-context';heading.append(detail);}head.append(heading,close);
 const nav=el('nav');nav.setAttribute('aria-label','Controlli documento');
 const button=(text,label,fn)=>{const b=el('button',text);b.type='button';b.setAttribute('aria-label',label);b.onclick=fn;nav.append(b);return b;};
 let rotation=0,zoom=1,pageNumber=1,pdf=null,image=null,url=null,closed=false,rendering=false,queued=false,task=null;
 const minus=button('−','Riduci',()=>resize(zoom/1.25)),percent=el('output');percent.setAttribute('aria-live','polite');nav.append(percent);
 const plus=button('+','Ingrandisci',()=>resize(zoom*1.25));
 button('Adatta','Adatta alla finestra',()=>resize(1));
 const rotate=button('↻ Ruota','Ruota il documento di 90 gradi',()=>{rotation=(rotation+90)%360;resize(1);viewport.scrollTo(0,0);});rotate.disabled=true;
 const prev=button('‹','Pagina precedente',()=>{pageNumber--;render();}),pages=el('output');nav.append(pages);
 const next=button('›','Pagina successiva',()=>{pageNumber++;render();});
 const download=el('a','Scarica');download.hidden=true;download.download=name;nav.append(download);
 const status=el('p','Caricamento documento…');status.className='document-viewer-status';status.setAttribute('role','status');
 const viewport=el('div'),surface=el('div');viewport.className='document-viewer-viewport';surface.className='document-viewer-surface';viewport.append(surface);
 dialog.append(head,nav,status,viewport);document.body.append(dialog);dialog.showModal();close.focus();
 const controls=()=>{percent.textContent=Math.round(zoom*100)+'%';minus.disabled=zoom<=.5;plus.disabled=zoom>=4;prev.hidden=next.hidden=pages.hidden=!pdf;prev.disabled=pageNumber<=1;next.disabled=!pdf||pageNumber>=pdf.numPages;pages.textContent=pdf?pageNumber+' / '+pdf.numPages:'';};
 function resize(value){zoom=Math.max(.5,Math.min(4,value));controls();if(image?.naturalWidth){renderImage();}else if(pdf)render();}
 function renderImage(){
  const sideways=rotation%180!==0,naturalWidth=sideways?image.naturalHeight:image.naturalWidth,naturalHeight=sideways?image.naturalWidth:image.naturalHeight;
  const width=Math.min(naturalWidth,Math.max(200,viewport.clientWidth-16))*zoom,height=width*naturalHeight/naturalWidth;
  const ratio=Math.min(window.devicePixelRatio||1,2,4096/Math.max(width,height)),canvas=el('canvas');
  canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',name+' · '+rotation+'°');
  const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
  const scale=width*ratio/naturalWidth;ctx.drawImage(image,-image.naturalWidth*scale/2,-image.naturalHeight*scale/2,image.naturalWidth*scale,image.naturalHeight*scale);surface.replaceChildren(canvas);
 }
 async function render(){
  controls();if(closed||!pdf)return;if(rendering){queued=true;return;}rendering=true;
  try{const page=await pdf.getPage(pageNumber);if(closed)return;const angle=((page.rotate||0)+rotation)%360,natural=page.getViewport({scale:1,rotation:angle}),width=Math.max(200,viewport.clientWidth-16)*zoom,scale=width/natural.width;
   const ratio=Math.min(window.devicePixelRatio||1,2,4096/Math.max(width,natural.height*scale)),view=page.getViewport({scale:scale*ratio,rotation:angle}),canvas=el('canvas');
   canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=width+'px';canvas.style.height=(natural.height*scale)+'px';
   task=page.render({canvasContext:canvas.getContext('2d'),viewport:view});await task.promise;if(!closed){surface.replaceChildren(canvas);status.textContent='';}
  }catch(e){if(!closed)status.textContent='Anteprima non disponibile. Puoi scaricare il documento.';}finally{rendering=false;task=null;if(queued&&!closed){queued=false;render();}}
 }
 dialog.addEventListener('close',()=>{closed=true;task?.cancel();pdf?.destroy();if(url)URL.revokeObjectURL(url);dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});},{once:true});
 controls();prev.hidden=next.hidden=pages.hidden=true;
 try{
  const file=await load();if(closed)return;if(!allowed()){dialog.close();return;}
  url=URL.createObjectURL(file);download.href=url;download.hidden=false;
  if(file.type.startsWith('image/')){
   image=el('img');image.alt=name;image.onload=()=>{if(closed)return;rotate.disabled=false;resize(1);status.textContent='Usa + e − per ingrandire; scorri per spostarti.';};image.onerror=()=>{status.textContent='Immagine non disponibile. Puoi scaricare il documento.';};image.src=url;
  }else if(file.type==='application/pdf'||/\.pdf$/i.test(name)){
   status.textContent='Preparazione PDF…';
   library??=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs').catch(e=>{library=null;throw e;});
   const engine=await library;if(closed)return;engine.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
   const data=await file.arrayBuffer();if(closed)return;pdf=await engine.getDocument({data, isEvalSupported:false}).promise;if(closed){pdf.destroy();return;}rotate.disabled=false;await render();
  }else status.textContent='Anteprima non disponibile per questo formato. Usa Scarica.';
 }catch(e){if(!closed)status.textContent='Impossibile aprire l’anteprima. '+(download.hidden?'Riprova.':'Puoi scaricare il documento.');}
 return dialog;
}
