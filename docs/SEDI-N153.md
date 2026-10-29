# Sedi N153 — versione 61

Il CDC profiles.site rimane N153 (committente Corte d’Appello). Aggiunta profiles.workplace nullable con le 11 sedi richieste e vincolo database: sede ammessa solo per lavoratori N153. Nessuna assegnazione automatica.

Amministratore: Gestione → Gestione lavoratori → Sede di lavoro → Salva modifiche. Le nuove registrazioni usano lo stesso campo nella gestione completa dei lavoratori. Lavoratore: menu Profilo, sotto il nome, CDC e sede assegnata; in assenza di scelta: Sede da assegnare.

Autorizzazioni esistenti conservate: solo amministratore aggiorna, lavoratore legge solo il proprio profilo. Il trigger audit esistente registra anche sede precedente e nuova. Nessuna modifica a documenti già caricati, cartelle Drive, saldi ferie, calcoli, autorizzazioni o fotocamera v60.

Test superati: 11 sedi uniche e diciture; browser con dati fittizi per selezione e visualizzazione profilo; SQL con ruolo authenticated amministratore per salvataggio e rilettura; rifiuto di sede inesistente; SQL lavoratore per isolamento lettura e impossibilità di modificare la sede. Tutti gli aggiornamenti di prova in transazioni con rollback. Hash dei sette campi profilo originari invariato: 27503d554b82e5eeafa3824f36bcf0cc; sedi assegnate prima del rilascio: zero. Regressioni ferie e controllo prospettiva superate.

Advisors: nessuna segnalazione sulla nuova colonna; restano avvisi preesistenti su RPC admin_worker_emails e protezione password compromesse, e tabelle riservate al backend senza policy client.
