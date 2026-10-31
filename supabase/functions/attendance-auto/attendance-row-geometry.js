// Map a unit square to the four selected table corners (TL, TR, BR, BL).
export function projection(p){
 if(p.length!==4||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))throw Error('Seleziona quattro angoli');
 const edges=p.map((a,i)=>({x:p[(i+1)%4].x-a.x,y:p[(i+1)%4].y-a.y}));
 const cross=edges.map((a,i)=>a.x*edges[(i+1)%4].y-a.y*edges[(i+1)%4].x);
 if(cross.some(v=>v<=0))throw Error('Angoli fuori ordine: riparti dall’alto a sinistra');
 const uv=[[0,0],[1,0],[1,1],[0,1]],a=[];
 p.forEach(({x,y},i)=>{const [u,v]=uv[i];a.push([u,v,1,0,0,0,-x*u,-x*v,x],[0,0,0,u,v,1,-y*u,-y*v,y]);});
 for(let k=0;k<8;k++){let best=k;for(let j=k+1;j<8;j++)if(Math.abs(a[j][k])>Math.abs(a[best][k]))best=j;[a[k],a[best]]=[a[best],a[k]];const n=a[k][k];if(Math.abs(n)<1e-9)throw Error('Tabella troppo piccola');for(let i=k;i<9;i++)a[k][i]/=n;for(let j=0;j<8;j++)if(j!==k){const t=a[j][k];for(let i=k;i<9;i++)a[j][i]-=t*a[k][i];}}
 const h=a.map(r=>r[8]);return (u,v)=>{const z=h[6]*u+h[7]*v+1;return {x:(h[0]*u+h[1]*v+h[2])/z,y:(h[3]*u+h[4]*v+h[5])/z};};
}
export function rowBounds(lines,day){
 if(lines.length!==32||!Number.isInteger(day)||day<1||day>31||lines.some((v,i)=>!Number.isFinite(v)||i&&v<=lines[i-1]))throw Error('Controlla i confini delle 31 righe');
 return {top:lines[day-1],bottom:lines[day]};
}
