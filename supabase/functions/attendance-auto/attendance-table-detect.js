// Local, deterministic grid detection. No document or pixel leaves the browser.
function binaryImage({data,width:w,height:h}){
 const gray=new Uint8Array(w*h),sum=new Float64Array((w+1)*(h+1));
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x,k=i*4;gray[i]=(data[k]*77+data[k+1]*150+data[k+2]*29)>>8;row+=gray[i];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}
 const pixels=[];for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const x0=Math.max(0,x-14),x1=Math.min(w,x+15),y0=Math.max(0,y-14),y1=Math.min(h,y+15),mean=(sum[y1*(w+1)+x1]-sum[y0*(w+1)+x1]-sum[y1*(w+1)+x0]+sum[y0*(w+1)+x0])/((x1-x0)*(y1-y0));if(gray[y*w+x]<mean-19&&gray[y*w+x]<190)pixels.push([x,y]);}
 return pixels;
}
export function detectAttendanceTable(image){
 const {width:w,height:h}=image;if(w<160||h<160)return null;const pixels=binaryImage(image),offset=Math.ceil(w*.24),length=h+offset*2,candidates=[];
 for(let angle=-.20;angle<=.2001;angle+=.005){const hist=new Uint16Array(length);for(const [x,y]of pixels){const b=Math.round(y-angle*(x-w/2))+offset;if(b>=0&&b<length)hist[b]++;}
  for(let b=offset;b<length-offset;b++){const score=hist[b]+hist[b-1]+hist[b+1];if(score<w*.30||score<(hist[b-2]+hist[b-1]+hist[b])||score<=(hist[b]+hist[b+1]+hist[b+2]))continue;candidates.push({slope:angle,center:b-offset,score});}
 }
 candidates.sort((a,b)=>b.score-a.score);const unique=[];for(const line of candidates){if(unique.some(a=>Math.abs(a.center-line.center)<3&&Math.abs(a.slope-line.slope)*w<12))continue;const bins=new Uint16Array(40);for(const [x,y]of pixels)if(Math.abs(y-line.center-line.slope*(x-w/2))<1.8)bins[Math.min(39,Math.floor(x/w*40))]++;
  let bestStart=0,bestEnd=-1,start=0,gap=0;for(let i=0;i<40;i++){if(bins[i]<w/40*.30){gap++;if(gap>1)start=i+1;}else{gap=0;if(i-start>bestEnd-bestStart){bestStart=start;bestEnd=i;}}}line.left=bestStart*w/40;line.right=(bestEnd+1)*w/40;if(line.right-line.left>w*.36)unique.push(line);if(unique.length>=160)break;
 }
 // Find 32 consecutive, regularly spaced grid lines with common horizontal extent.
 let best=null;for(const first of unique)for(const last of unique){const distance=last.center-first.center;if(distance<h*.16||distance>h*.84)continue;const step=distance/31;if(step<4||step>w*.10)continue;const left=Math.max(first.left,last.left),right=Math.min(first.right,last.right);if(right-left<w*.36)continue;
  for(let bend=-.10;bend<=.1001;bend+=.02){const found=[],used=new Set();let error=0;for(let i=0;i<32;i++){const t=i/31,y=first.center+distance*(t+bend*t*(1-t)),slope=first.slope+(last.slope-first.slope)*i/31;let match=null,cost=Infinity;for(const l of unique){if(used.has(l)||Math.min(l.right,right)-Math.max(l.left,left)<(right-left)*.80)continue;const delta=Math.abs(l.center-y),skew=Math.abs(l.slope-slope)*(right-left);const value=delta+skew*.15;if(delta<step*.30&&skew<step*.65&&value<cost){match=l;cost=value;}}if(!match)break;found.push(match);used.add(match);error+=cost/step;}
  if(found.length!==32)continue;const gaps=found.slice(1).map((l,i)=>l.center-found[i].center),ratio=Math.max(...gaps)/Math.min(...gaps);if(ratio>1.65)continue;
  const score=(right-left)/w-error/100;if(!best||score>best.score)best={score,found,left,right,error};
  }
 }
 if(!best||best.score<.36)return null;
 const {found,left,right}=best,first=found[0],last=found[31],point=(l,x)=>({x,y:l.center+l.slope*(x-w/2)});
 return {corners:[point(first,left),point(first,right),point(last,right),point(last,left)],lines:found.map(l=>({left:point(l,left),right:point(l,right)})),confidence:Math.max(0,Math.min(1,1-best.error/16)),count:31};
}
