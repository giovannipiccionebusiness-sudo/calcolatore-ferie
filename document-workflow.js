export const isAuthorizationRequest=d=>['ferie','rol'].includes(d.category);
export function documentAction(d){
 if(isAuthorizationRequest(d))return d.authorization==='pending'&&['pending','verified'].includes(d.review_status)?'authorize':'';
 return d.review_status==='pending'?'review':'';
}
export function documentStatus(d){
 if(isAuthorizationRequest(d))return d.authorization==='approved'?'Autorizzata':d.authorization==='denied'?'Non autorizzata':d.review_status==='rejected'?'Richiesta respinta':'Da autorizzare';
 return {pending:'In verifica',verified:'Documento verificato',rejected:'Documento respinto'}[d.review_status]||d.review_status;
}
