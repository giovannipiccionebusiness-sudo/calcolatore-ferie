# Saldi individuali e simulazione ferie

## Avvio amministrativo
In Gestione e verifiche aprire «Saldi ferie, importazioni e proiezioni». Selezionare ogni lavoratore e confermare esplicitamente l'associazione con il suo account: il suggerimento per nome e cognome non concede accesso. Il lavoratore può leggere solo la persona collegata al proprio account attivo.

Confermare le quote mensili e la relativa decorrenza. Le proposte restano stime finché non vengono confermate; gli altri casi sono «Da verificare». Una semplice crescita del residuo non prova la maturazione. I confronti mostrano variazioni, mesi mancanti e utilizzi registrati; una proposta dallo storico richiede intervalli riconciliati e incrementi corretti stabili. Le modifiche amministrative sono versionate e non vengono sovrascritte dalle importazioni.

Confermare la distribuzione delle ore su tutti i sette giorni e l'equivalenza in ore di un giorno del report, separatamente per ferie e ROL. Inserire le eccezioni del calendario, anche a zero ore per festività o riposo. Non vengono presunti cinque giorni lavorativi né una corrispondenza fra giorno del report e turno. Per le aspettative inserire date, regole di maturazione separate e metodo di trattamento dei mesi parziali; non si ricava una quota ordinaria da saldi fermi.

## Importazione Excel
Il periodo viene letto da «Riepilogo Prompt». Si importa il dettaglio individuale «Ferie GG», «ROL GG» ed ex festività nella sezione «Residui assenza effettiva», escludendo «Full time equivalente». L'anteprima consente il controllo prima della conferma. Righe completamente senza saldo sono segnalate e saltate, non trasformate in zero; dati parziali bloccano l'importazione.

La chiave del contenuto identifica i duplicati, anche con nomi file diversi. Un contenuto diverso nello stesso periodo richiede conferma di sostituzione. Un mese più recente sostituisce il saldo di riferimento, senza sommarlo. I valori originali restano numerici esatti nel database e stringhe decimali nell'API; il calcolo usa decimal.js con precisione 80, senza arrotondamenti intermedi. La visualizzazione ordinaria a due decimali è affiancata dai valori originali.

## Utilizzi e documenti
Registrare gli utilizzi e gli impegni autorizzati con date, categoria e quantità calcolata sul calendario individuale. I documenti approvati di ferie/ROL devono essere associati al registro, dichiarati compresi in un report o esplicitamente classificati come non pertinenti. La simulazione si blocca se questa riconciliazione manca: il testo o la fotografia del modulo non costituiscono dati strutturati affidabili.

Alla nuova importazione gli utilizzi con data entro il saldo non vengono sottratti di nuovo. Per vecchi impegni autorizzati non ancora riconciliati viene richiesta una verifica esplicita. Le quantità già prenotate nelle date della simulazione non vengono addebitate due volte. Gli impegni successivi al saldo rimangono riservati anche se successivi alla partenza.

## Simula le tue ferie
Il lavoratore seleziona date future e categoria. Sono distinti saldo dell'ultimo report, maturazione successiva, utilizzi, impegni, richiesta aggiuntiva e residuo. Si maturano soltanto mesi conclusi prima della partenza. Ferie e ROL non si compensano; le ex festività restano separate. Dati mancanti o non confermati bloccano il risultato. Il risultato riporta «Saldo previsto sufficiente» oppure la mancanza e «Proiezione indicativa, soggetta a verifica e autorizzazione».

## Verifica e manutenzione
Test del motore: `node --experimental-default-type=module tests/leave-core.test.mjs`. Il test SQL di accesso va eseguito in un ambiente amministrativo: usa una transazione e rollback e richiede lo schema applicativo esistente.

Sono verificati precisione, duplicati e sostituzioni, mesi mancanti, settimane a sei giorni, conversioni ore/giorni, aspettative complete e parziali, saldi negativi, attraversamento d'anno, mancata riconciliazione, coperture importate e sovrapposizioni. Verificati anche isolamento account, privilegi amministrativi, accesso/uscita, conservazione del calcolatore manuale e controlli di installazione nell'app completa.

I report e i dati personali non appartengono al repository pubblico. Tabelle e procedure del modulo sono riservate al servizio; l'Edge Function autentica la sessione e verifica il profilo attivo e il ruolo nel database. Le associazioni e le correzioni hanno un audit amministrativo.
