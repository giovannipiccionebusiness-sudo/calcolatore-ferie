# Controllo notifiche — 8.9

Nel pannello amministratore, tra le operazioni, la sezione **Controllo notifiche** permette di scegliere un giorno e usare il CDC selezionato nel pannello. Include i lavoratori attivi: avviso generato, invii push riusciti/falliti/in corso/saltati, apertura del promemoria nell'app, giornata salvata e numero di telefoni attualmente registrati. Ricerca e filtri sono applicati ai risultati. La sezione si carica soltanto quando viene aperta.

Un push `sent` significa accettazione del servizio push, non visualizzazione sul dispositivo. `read_at` indica apertura nell'app, anche dalla campanella. Il riepilogo non inventa ricevute di consegna o lettura del sistema operativo. Le registrazioni dei telefoni sono attuali e possono differire da quelle presenti in una data passata. Le righe di invio sono distinte per dispositivo, i contatori riassuntivi per lavoratore; un invio riuscito con altri falliti è segnalato nel dettaglio senza contare due lavoratori.

La nuova Edge Function `notification-report` controlla il Bearer con Auth e verifica il profilo attivo. Solo il ruolo admin può leggere il riepilogo globale; il caposervizio resta un worker. L'azione `device-status` non espone dati altrui: cerca esclusivamente la registrazione del richiedente e restituisce un booleano relativo all'ultimo invio giornaliero. Non sono restituiti endpoint, chiavi, causali, ore di assenza o supplementare. Non vengono introdotti nuovi privilegi SQL o policy.

La home lavoratore mostra **Non dimenticare ore e assenze — Attiva le notifiche per ricordarti di inserire ore e assenze** quando gli avvisi non risultano attivati. Sono mantenute le istruzioni specifiche per permessi bloccati e iPhone. Se l'ultimo invio giornaliero al dispositivo locale è fallito, viene proposto **Ripristina avvisi**. Solo alla pressione del lavoratore viene rinnovata la sottoscrizione locale, poi viene proposta la prova di ricezione. Le vecchie registrazioni e lo storico sul server non vengono cancellati automaticamente; resta applicato il limite per app.

Le funzioni di pianificazione e invio dei promemoria restano invariate. Nessun invio massivo, prova su telefoni reali o modifica delle giornate dei lavoratori viene effettuato da questa modifica. La giornata già compilata continua a evitare il promemoria giornaliero; il venerdì mantiene il controllo settimanale.

Verifica: `node --test tests/notification-report.test.cjs`, controllo sintattico dei moduli e prova nel browser con dati fittizi del filtro invii falliti e del ripristino di un dispositivo simulato.
