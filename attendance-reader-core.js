export const CAUSES={'':'Nessuna',F:'Ferie',M:'Malattia',L104:'Legge 104',PHR:'ROL / permesso','congedo parentale':'Congedo parentale'};
// The app displays decimal hours rounded to two decimals. Recover exact whole minutes.
export function decimalMinutes(value){
 const s=String(value).trim().replace(',','.');
 if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(s))throw Error('Inserisci ore decimali valide, massimo due cifre dopo la virgola');
 const n=Number(s);if(n<0||n>24)throw Error('Le ore del giorno devono essere tra 0 e 24');return Math.round(n*60);
}
export function causeCode(text){
 const s=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.,]/g,' ');
 const matches=[];
 if(/\bferi[ae]\b|^\s*f\s*$/.test(s))matches.push('F');
 if(/\bmalattia\b|^\s*m\s*$/.test(s))matches.push('M');
 if(/\b104\b|\bl\s*104\b/.test(s))matches.push('L104');
 if(/\bconged\w*\b/.test(s))matches.push('congedo parentale');
 if(/\br\s*o\s*l\b|\brol\b|\bphr\b/.test(s))matches.push('PHR');
 return matches.length===1?matches[0]:'';
}
// A whole cell must be a number: never infer a total from notes or entry/exit times.
export function readTotal(raw){
 const s=String(raw||'').trim();if(!/^\d{1,2}(?:[,.]\d{1,2})?$/.test(s))return null;
 const n=Number(s.replace(',','.'))*60;
 return Number.isInteger(Math.round(n*1e6)/1e6)&&n>=0&&n<=1440?Math.round(n):null;
}
export function splitWorked(total,expected){
 if(!Number.isInteger(total)||total<0||total>1440)throw Error('Totale del giorno non valido');
 if(expected===null||expected===undefined||!Number.isFinite(expected)||expected<0||expected>1440)throw Error('Imposta e conferma prima il contratto giornaliero');
 const contract=Math.round(expected);return {ordinary:Math.min(total,contract),supplementary:Math.max(0,total-contract),rounded:contract!==expected};
}
