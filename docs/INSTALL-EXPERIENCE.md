# Installazione Lavoro Facile

Pulsanti in Documenti e Calcolatore, invito con icona e nome dopo 1,8 secondi, istruzioni Apple in Safari. Android usa beforeinstallprompt quando disponibile, altrimenti mostra i passaggi manuali. Il dialogo del browser resta necessario per confermare l’installazione.

Gli inviti vengono nascosti in display-mode standalone, navigator.standalone Apple, dopo appinstalled, per lo stato installato ricordato localmente, oppure quando getInstalledRelatedApps riconosce il manifest della stessa app. Il manifest dichiara la relazione webapp con se stesso. Non cambiano start_url o scope.

Su Safari non esiste un rilevamento universale delle installazioni già fatte in un’altra sessione o spazio dati: si offre anche “Già installata”. L’apertura dall’icona registra il riconoscimento nei dati disponibili. Se l’app viene disinstallata, lo stato locale può persistere finché non vengono cancellati i dati del sito. “Più tardi” sospende soltanto il pop-up nella sessione corrente.

Verifica: node tests/install-app.test.cjs (Android, iPhone Safari e Chrome, iPad desktop, rilevamento installato e controlli duplicati).
