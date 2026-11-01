# Acquisizione delle dichiarazioni nelle presenze verificate

Nel dettaglio di una giornata, il responsabile seleziona «Verifica e acquisisci». Si apre un’anteprima con supplementare e giustificativo riportati nei campi; le ore ordinarie già registrate restano invariate. Dopo il controllo di ore e sedi, spunta la verifica e seleziona «Conferma acquisizione».

Per una sola sede il supplementare viene precompilato; con più sedi va ripartito esplicitamente e la somma deve coincidere con il dichiarato. L’acquisizione sostituisce il supplementare della giornata, senza sommarlo al precedente. Per le assenze parziali usa i minuti dichiarati; per la giornata intera propone il contratto arrotondato al minuto, se disponibile, altrimenti chiede le ore al responsabile. Una giornata intera di assenza non può essere acquisita mantenendo ore ordinarie lavorate: queste vanno prima corrette nel salvataggio manuale.

Le ordinarie di una nuova giornata vanno controllate e inserite dal responsabile; non vengono inventate dall’app. Per correggere ordinarie già presenti o una causale errata, resta disponibile «Torna alla modifica manuale».

La nuova RPC acquire_presence_declaration è SECURITY INVOKER: restano valide RLS, validazione e audit di hour_budget_days. Risolve sia account diretti sia lavoratori collegati all’importazione attraverso il resolver esistente. Usa il medesimo lock del salvataggio delle dichiarazioni e controlla le versioni sia della dichiarazione sia della giornata. Le ordinarie esistenti sono protette per sede anche sul server. Il riferimento alla dichiarazione e alla sua versione viene conservato nell’annotazione e nell’audit esistente.

Dopo la conferma, la tabella presenze e i suoi budget si ricaricano. Anche «Controllo ore per sede» riceve la riga salvata e aggiorna i totali del periodo già aperto. Non cambiano calcolo dei budget, upload, documenti, notifiche o spunta manuale di Ergoweb.

Verifiche: test SQL in rollback su date storiche inutilizzate, test delle regole di precompilazione e regressioni delle presenze/budget. Prova browser locale con dati fittizi: O 4,00 rimane invariato, S passa da 0,50 a 1,50 e il totale verificato della sede passa da 4,50 a 5,50 senza ricaricare la pagina. Nessuna presenza reale è stata acquisita durante lo sviluppo.
