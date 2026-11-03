# Inserimento presenze semplificato — 9.5

Una scelta esclusiva per ogni giornata: Orario abituale, Ore in più, Assenza. I nuovi giorni richiedono una scelta esplicita; i dati già salvati vengono riproposti. La sola scelta non salva: un unico pulsante Salva giornata / Salva settimana invia i dati. Rimosse la casella Confermo e l'azione separata Nessuna variazione.

Si mantengono le RPC esistenti, i controlli sulla sessione, le versioni per evitare sovrascritture, i giustificativi e il calcolo in minuti. Nessuna variazione a permessi, presenze confermate o acquisizione amministratore.

QA su dati fittizi: blocco del salvataggio senza scelta; orario abituale con supplementare zero e nessuna assenza; 1,30 supplementare inviato come 90 minuti; passaggio da supplementare a ROL parziale con supplementare azzerato e assenza 90 minuti; riepilogo settimanale con dati precedenti e salvataggio dei soli giorni trascorsi. Browser smartphone 390 px: tre scelte, zero checkbox, azione Salva visibile. Test esistenti del core superati per formati durata, decimali, giorni futuri e settimane a cavallo del mese. Controllo sintassi JS superato. Nessuna presenza reale modificata durante le prove.
