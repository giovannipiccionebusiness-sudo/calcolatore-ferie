export function notificationStatus(row){
 if(row.push.sent)return {key:'sent',label:'Push inviato',detail:row.push.failed?'Invio riuscito su almeno un dispositivo; altri invii falliti.':'Accettato dal servizio push; la visualizzazione sul telefono non è verificabile.'};
 if(row.push.pending)return {key:'pending',label:'Invio in corso',detail:'Il servizio sta elaborando l’avviso.'};
 if(row.push.failed)return {key:'failed',label:'Invio fallito',detail:'Far aprire al lavoratore Campanella → Avvisi sul telefono e ripristinare gli avvisi.'};
 if(!row.devices)return {key:'no_device',label:'Nessun telefono registrato',detail:row.notice_at?'Promemoria disponibile nell’app. Attivare gli avvisi sul telefono.':'Attivare gli avvisi sul telefono per ricevere i prossimi promemoria.'};
 if(row.notice_at)return {key:'app_only',label:row.push.skipped?'Invio saltato':'Solo nell’app',detail:row.opened_at?'Promemoria già aperto nell’app.':'Avviso generato; nessun invio push riuscito registrato.'};
 if(row.day_saved_at&&row.kind!=='week')return {key:'saved',label:'Giornata già compilata',detail:'Nessun avviso generato. Il venerdì resta previsto il controllo della settimana.'};
 if(!row.shift_set)return {key:'no_shift',label:'Fasce orarie da impostare',detail:'Impostare il turno del lavoratore per attivare il promemoria giornaliero.'};
 if(!row.working_day)return {key:'rest',label:'Nessun turno previsto',detail:'Non è previsto un promemoria per questa giornata.'};
 return {key:'not_generated',label:'Avviso non generato',detail:'Può non essere ancora arrivato l’orario del promemoria; il riepilogo mostra i dati registrati, senza ricostruire gli eventi passati.'};
}
export function notificationTotals(rows){return {workers:rows.length,generated:rows.filter(r=>r.notice_at).length,sent:rows.filter(r=>r.push.sent>0).length,failed:rows.filter(r=>r.push.failed>0&&!r.push.sent).length,opened:rows.filter(r=>r.opened_at).length,noDevice:rows.filter(r=>!r.devices).length};}
