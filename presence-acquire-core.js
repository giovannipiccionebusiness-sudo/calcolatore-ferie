export function prepareDeclaration(declaration,allocations,expectedMinutes){
 const rows=allocations.map(r=>({...r}));if(rows.length===1)rows[0].overtime=declaration.supplementary_minutes;else if(!declaration.supplementary_minutes)for(const r of rows)r.overtime=0;
 const absence=declaration.absence_scope==='partial'?declaration.absence_minutes:declaration.absence_scope==='full'?(Number.isFinite(expectedMinutes)&&expectedMinutes>0?Math.round(expectedMinutes):null):0;
 return {allocations:rows,absence_minutes:absence,cause:declaration.cause,needsSplit:rows.length>1&&declaration.supplementary_minutes>0};
}
