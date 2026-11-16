# Consultazione rapida presenze

Accesso: amministratore → Pannello → Consultazione rapida presenze. Scegliere mese e CDC e premere Carica / aggiorna. Elenco per cognome, nome e matricola dal registro importato; gli account senza associazione al report mostrano il nome account e un avviso sul cognome da verificare nel visualizzatore.

Apertura diretta dell'ultimo foglio del mese esatto; precedenza al definitivo mensile, poi caricamenti più recenti. Esclusi respinti e file sostituiti da un invio valido. Gli altri caricamenti si scelgono nel visualizzatore. I lavoratori importati senza account rimangono nell'elenco; i documenti delegati sono associati tramite recipient_person_key. Un mese senza file mostra Foglio mancante, senza ripiegare su altri mesi.

Precedente, Successivo e Segna consultato e passa al successivo sono sempre disponibili sopra il documento, insieme a cognome, nome, matricola, CDC e mese. Zoom, rotazione, download e pagine PDF riutilizzano il visualizzatore privato. A fine elenco si rimane sull'ultimo lavoratore. Consultato non cambia verifiche, approvazioni o dati di presenza. Il promemoria locale è separato per amministratore, mese, lavoratore e file; un nuovo file non eredita il segno precedente. I dati visualizzati vengono rimossi al logout.

Sicurezza: sole richieste autenticate, lista matricole da attendance_roster (già limitata agli amministratori), documenti soggetti alle RLS e download Drive privato esistente. Nessuna modifica a schema, permessi o salvataggi presenze. La selezione invalida il visualizzatore precedente; i risultati tardivi e i cambi sessione non possono ripopolare la sezione.

Verifiche: tests/quick-presence.test.mjs, tests/quick-presence.dom.cjs, tests/document-viewer-reconnect.test.cjs. DOM test con linkedom 0.18.12. Verifica visiva su computer affiancato da completare con l'utente.
