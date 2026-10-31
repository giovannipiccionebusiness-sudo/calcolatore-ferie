// Keep the full page as primary evidence. Overlapping, full-width strips preserve printed day numbers.
export async function readingDetails(blob){
 const pages=[];
 if(blob.type==='application/pdf'){
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false});
  try{const pdf=await task.promise;if(pdf.numPages>2)throw Error('La lettura approfondita supporta PDF fino a due pagine');for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),v=p.getViewport({scale:1}),view=p.getViewport({scale:Math.min(3,1800/v.width)}),c=document.createElement('canvas');c.width=Math.ceil(view.width);c.height=Math.ceil(view.height);await p.render({canvasContext:c.getContext('2d'),viewport:view,background:'white'}).promise;pages.push(c);}}finally{await task.destroy();}
 }else{const bitmap=await createImageBitmap(blob);try{const c=document.createElement('canvas'),scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);pages.push(c);}finally{bitmap.close();}}
 const images=[];
 for(const page of pages)for(const [start,end]of [[0,.45],[.30,.75],[.60,1]]){const c=document.createElement('canvas');c.width=Math.min(1800,page.width);c.height=Math.round(page.height*(end-start)*c.width/page.width);c.getContext('2d').drawImage(page,0,Math.round(page.height*start),page.width,Math.round(page.height*(end-start)),0,0,c.width,c.height);images.push(c.toDataURL('image/jpeg',.85));c.width=c.height=1;}
 for(const p of pages)p.width=p.height=1;
 if(images.reduce((n,x)=>n+x.length,0)>4*1024*1024)throw Error('Dettagli oltre 4 MB: usa una foto più leggera');return images;
}
