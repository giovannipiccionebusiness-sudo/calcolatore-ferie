import assert from 'node:assert/strict';
import {projection} from '../attendance-row-geometry.js';
import {detectAttendanceTable} from '../attendance-table-detect.js';
function fixture(withGrid=true){
 const width=600,height=900,data=new Uint8ClampedArray(width*height*4).fill(255);
 const line=(a,b)=>{const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2);for(let i=0;i<=n;i++){const x=Math.round(a.x+(b.x-a.x)*i/n),y=Math.round(a.y+(b.y-a.y)*i/n);if(x>=0&&x<width&&y>=0&&y<height){const k=(y*width+x)*4;data[k]=data[k+1]=data[k+2]=35;}}};
 const corners=[{x:55,y:210},{x:550,y:228},{x:562,y:710},{x:40,y:695}],map=projection(corners);
 if(withGrid){for(let i=0;i<32;i++)line(map(0,i/31),map(1,i/31));for(let i=0;i<12;i++)line(map(i/11,0),map(i/11,1));}
 // Non-table horizontal borders must not become daily rows.
 for(const y of [50,150,760,830])line({x:30,y},{x:570,y:y+2});
 return {width,height,data};
}
const r=detectAttendanceTable(fixture());assert.ok(r&&r.count===31&&r.confidence>=.78);assert.equal(r.lines.length,32);
assert.ok(Math.abs(r.corners[0].y-210)<12);assert.ok(Math.abs(r.corners[3].y-695)<12);
assert.equal(detectAttendanceTable(fixture(false)),null);assert.equal(detectAttendanceTable({width:200,height:200,data:new Uint8ClampedArray(200*200*4).fill(255)}),null);
console.log('Passed: perspective grid with 31 rows, rejection of unrelated page borders, blank page fallback.');
