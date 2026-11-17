# Consultazione rapida presenze

Accesso: amministratore → Pannello → Consultazione rapida presenze. Scegliere mese e CDC e premere Carica / aggiorna. Elenco per cognome, nome e matricola dal registro importato; gli account senza associazione al report mostrano il nome account e un avviso sul cognome da verificare nel visualizzatore.

Apertura diretta dell'ultimo foglio del mese esatto; precedenza al definitivo mensile, poi caricamenti più recenti. Esclusi respinti e file sostituiti da un invio valido. Gli altri caricamenti si scelgono nel visualizzatore. I lavoratori importati senza account rimangono nell'elenco; i documenti delegati sono associati tramite recipient_person_key. Un mese senza file mostra Foglio mancante, senza ripiegare su altri mesi.

Precedente, Successivo e Segna consultato e passa al successivo sono sempre disponibili sopra il documento, insieme a cognome, nome, matricola, CDC e mese. Zoom, rotazione, download e pagine PDF riutilizzano il visualizzatore privato. A fine elenco si rimane sull'ultimo lavoratore. Consultato non cambia verifiche, approvazioni o dati di presenza. Il promemoria viene salvato online nella tabella presence_consultations ed è separato per amministratore, documento e settimana (o definitivo). È visibile dallo stesso account sui diversi dispositivi dopo Carica / aggiorna; un nuovo file non eredita il segno precedente. I dati visualizzati vengono rimossi al logout.

Sicurezza: sole richieste autenticate, lista matricole da attendance_roster (già limitata agli amministratori), documenti soggetti alle RLS e download Drive privato esistente. Nessuna modifica a schema, permessi o salvataggi presenze. La selezione invalida il visualizzatore precedente; i risultati tardivi e i cambi sessione non possono ripopolare la sezione.

Verifiche: tests/quick-presence.test.mjs, tests/quick-presence.dom.cjs, tests/document-viewer-reconnect.test.cjs. DOM test con linkedom 0.18.12. Verifica visiva su computer affiancato da completare con l'utente.


## Sincronizzazione dalla versione 9.40

Premere Carica / aggiorna sul browser del PC usato per le vecchie spunte. Le chiavi locali del mese caricato (sia nel vecchio formato mensile sia in quello settimanale) vengono associate al documento e alla settimana effettivi e trasferite online senza duplicati. Nessuna cancellazione del dato locale; ripetere per altri mesi da recuperare. Sul telefono usare lo stesso account e premere Carica / aggiorna. Senza riaprire quel browser del PC non è possibile leggere le vecchie spunte locali.

La nuova conferma attende l'esito online prima di avanzare. In caso di errore resta sul lavoratore e mostra Riprova salvataggio. Lo stato online è autorevole; il backup locale serve al recupero, non a fingere sincronizzazione. I caricamenti RLS, la settimana e l'identità amministratore sono controllati sul database. Non sono concessi UPDATE o DELETE ai client. SQL tests su dati reali interamente in transazione ROLLBACK; nessuna spunta di produzione creata dai test.

## Cessazioni (9.42)

Ogni scheda dispone di Segna come cessato. La data indica l'ultimo giorno di lavoro, incluso. La consultazione predefinita In servizio nel periodo esclude chi è cessato prima del lunedì della settimana scelta; il lavoratore rimane nella settimana della cessazione e in quelle precedenti. Il definitivo mensile resta previsto se la cessazione è durante quel mese. Il filtro Cessati prima del periodo permette di ritrovare i nominativi, correggere la data o annullare la cessazione. Tutti, compresi i cessati mostra l'elenco completo.

Lo stato è condiviso online tra amministratori e dispositivi. Non vengono eliminati documenti, account, spunte di consultazione o saldi e non viene modificata l'abilitazione di accesso. I nuovi report non cancellano le cessazioni salvate. Sono gestiti account senza registro e lavoratori del registro senza account, mantenendo l'identità anche dopo un'associazione.

DB: worker_employment_status con RLS solo amministratori. set_worker_employment usa SECURITY INVOKER, controllo versione e lock; un helper privato ristretto e autenticato legge l'identità dal registro non esposto. Nessun nominativo viene cessato dalla distribuzione. I test SQL usano ROLLBACK e verificano salvataggio, correzione, annullamento, conflitto versione e rifiuto lavoratore. Test DOM verifica il comando, il filtro e il ripristino; employment-core.test.mjs verifica le date di confine e la storia.
