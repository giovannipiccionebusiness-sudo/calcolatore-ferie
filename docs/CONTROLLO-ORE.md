# Controllo ore N153 — prima versione amministratore 62

## Utilizzo
Gestione → Controllo ore per sede · N153. Scegli primo giorno e sede (vista di sette giorni). Apri «Organico e assegnazioni sedi»: seleziona ogni persona importata, assegna sede e decorrenza, oppure escludila dal perimetro con decorrenza. Gli orari sono quelli già salvati e confermati nel calcolatore ferie, comprese le distribuzioni su cinque/sei giorni e le eccezioni giornaliere. Conferma che l’organico del mese sia completo.

Il budget comprende le persone del report, non solo gli account attivi. Il collegamento account continua a essere gestito nella sezione ferie e non crea una seconda persona. Eventuali account attivi N153 non collegati al report impediscono un esito definitivo. Non vengono dedotte sedi dallo storico né effettuati abbinamenti automatici. Le assegnazioni per il budget sono datate e distinte dalla sede corrente del profilo. Non si modificano profili o configurazioni ferie.

Apri «Verifica ore dal foglio presenze»: scegli persona e giorno, consulta il foglio più recente disponibile, inserisci ore ordinarie e straordinarie effettive per la sede in cui sono state svolte. Puoi ripartire la giornata su più sedi. Le assenze restano separate. Conferma il controllo. Per chi non ha account puoi verificare un foglio cartaceo/esterno e registrarne il riferimento: questa versione non archivia un nuovo allegato per conto della persona non registrata. Registra anche i riposi con zero ore per escludere straordinari o trasferte non rilevati.

Per festività, chiusure o variazioni del servizio, «Budget eccezionale» permette di confermare il totale previsto della sede per una data, con motivo obbligatorio. Il budget base segue il contratto senza dedurre automaticamente festività o assenze.

## Stati
Verde: totale uguale. Blu: risparmio. Rosso: superamento da verificare, non dichiarazione automatica di errore individuale. Arancione: organico, sede, orario o presenze incompleti. In arancione si mostrano solo i totali parziali; non è indicato un risparmio. Per prudenza tutti gli inclusi devono avere le presenze verificate, anche quando assegnati ad altre sedi: potrebbero avere svolto sostituzioni nella sede selezionata.

Un foglio successivo che copre il giorno rende da riconfermare i dati associati al foglio precedente. Una persona/giorno ha un solo record, quindi le revisioni sostituiscono e non sommano le ore. Gli inserimenti manuali esterni restano verifiche amministrative esplicite.

## Dati e limiti
Tabelle nuove e separate hour_budget_assignments/days/calendar/roster/audit. RLS amministratore, nessun accesso lavoratore/anonimo. Vincoli su sedi, documenti, minuti, massimo 24 ore persona/giorno, versioni e audit transazionale. Collegamento foglio controllato lato database usando l’associazione account del registro HR. Un helper privato legge solo l’account corrispondente dopo controllo amministratore. Nessuna nuova Edge Function; lettura anagrafica/orari tramite le API esistenti.

Non è ancora presente OCR: le ore del foglio vengono inserite e confermate dall’amministratore. Non vengono aggiornati saldi ferie, ROL, ledger, approvazioni richieste o file originali.

## Verifiche
- tests/hour-budget.test.mjs: lavoratori senza account, decorrenze, assenze e sostituzioni, risparmio/superamento, ripartizione sedi, dati incompleti, fogli sostituiti, budget eccezionale e minuti esatti.
- tests/hour-budget-db.test.mjs: schema Postgres locale PGlite, scrittura e lettura admin, audit, vincoli, concorrenza ottimistica, isolamento lavoratore, anonimo bloccato. Riproducibile con npm ci --prefix tests/rest-db --ignore-scripts; REST_PGLITE_MODULE impostato al percorso assoluto di tests/rest-db/node_modules/@electric-sql/pglite/dist/index.js.
- Database con ruolo amministratore e lavoratore, transazioni rollback: salvataggio, audit e rifiuto scrittura lavoratore superati. Tabelle operative e audit nuove vuote dopo le prove.
- Browser con dati fittizi: apertura, caricamento orari, registrazione 4 ore ordinarie + 1 straordinario contro budget 4; indicazione rossa di +1 ora confermata. Fixture tests/fixtures/hour-budget-review.html.
- Regressioni ferie, prospettiva fotocamera e sedi N153 superate. Nessun advisor riferito alle nuove tabelle/funzioni; avvisi preesistenti non modificati.

## Aggiornamento 63 — nuovi assunti e riepilogo per sede

Gli avvisi di anagrafica non vengono più ripetuti per giorno: compaiono una sola volta nel riepilogo generale. Il dettaglio della sede mostra solo assegnati ed eventuali sostituti per cui sono state registrate ore verso la sede. Le presenze mancanti di altre sedi non bloccano il controllo locale; rimangono bloccanti le incompletezze dell’anagrafica globale. I trasferimenti non ancora registrati non possono essere dedotti automaticamente dai fogli: inserire le ripartizioni effettive durante la verifica. Giorni futuri: budget previsto e «Presenze non ancora disponibili», nessun falso risparmio o avviso di mancato invio.

In Organico compare «Nuovi assunti senza report residui»: scegli account N153 registrato non associato ai report e aggiungilo al controllo. Selezionalo nell’elenco, imposta le ore nei sette giorni (zero nei riposi), conferma e salva l’orario; assegna la sede con decorrenza. Non viene inserito alcun saldo ferie o ROL. Le schede restano nel registro budget indipendente hour_budget_registry, protetto da RLS amministratore e audit. I riferimenti delle assegnazioni/presenze passano al registro senza modificare le righe esistenti.

Gli import HR futuri creano automaticamente solo l’identità budget corrispondente. Se un nuovo assunto viene successivamente collegato al report, si mantiene l’identità budget già utilizzata e non si sommano due persone. Si riusano gli orari confermati del report quando disponibili. Eventuali assegnazioni pregresse sotto entrambe le identità sono segnalate per riallineamento, senza sommare le ore.

Test aggiunti: filtro segnalazioni per sede, sostituzioni in ingresso, date future, anagrafica nuovi assunti e successivo collegamento senza duplicazione; Postgres per contratti nuovi assunti, vincoli, registrazioni e import HR con ruolo service e nessun nuovo accesso allo schema privato. Browser con dati fittizi: aggiunta, sede, contratto e contributo al budget (4 → 8 ore) verificati. Prove remote nuove schede in transazione annullata; nessun nuovo assunto reale aggiunto. Hash assegnazioni prima/dopo invariato f9b0dcc8eaa498d488cfe1cb56a5342b. Regressioni ferie/ROL, sedi e prospettiva fotocamera superate.
