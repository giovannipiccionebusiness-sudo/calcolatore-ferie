export function inlineVerification(draft,declaration,day,today){
 if(day>today)throw Error('Non puoi verificare giorni futuri');
 if(!draft?.ready||!draft.allocations?.length)throw Error(draft?.reason||'Completa prima ore e sede nei dettagli');
 if(!declaration||draft.version!==declaration.version)throw Error('Dichiarazione cambiata: aggiorna e ricontrolla');
 const allocations=draft.allocations.map(r=>({...r}));
 if(allocations.some(r=>!r.workplace||![r.ordinary,r.overtime].every(n=>Number.isInteger(n)&&n>=0))||!Number.isInteger(draft.absence)||draft.absence<0)throw Error('Ore o sede da controllare');
 const ordinary=allocations.reduce((n,r)=>n+r.ordinary,0),extra=allocations.reduce((n,r)=>n+r.overtime,0);
 if(extra!==declaration.supplementary_minutes||draft.cause!==(declaration.cause||''))throw Error('Dichiarazione cambiata: aggiorna e ricontrolla');
 if(declaration.absence_scope==='full'&&(ordinary!==0||draft.absence<=0))throw Error('Controlla nei dettagli l’assenza di giornata intera');
 if(ordinary+extra+draft.absence>1440)throw Error('Il totale supera 24 ore');
 return {allocations,absence_minutes:draft.absence,justification:draft.cause,confirmed:true};
}
