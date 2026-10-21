# Scansioni di tutti i moduli

Nell’archivio amministratore, foto e PDF (fino a 10 pagine) di ferie, ROL, Legge 104, malattia e congedo parentale vengono elaborati. PDF.js 4.10.38 viene caricato dal CDN con versione fissata; la conversione avviene nel browser, senza inviare i documenti a servizi di conversione. Per i PDF creati dall’app vengono elaborate le foto originali allegate, mantenendo l’ordine; gli altri PDF sono renderizzati pagina per pagina. Un errore di elaborazione conserva sempre l’originale e mostra Riprova.

Originale e scansione sono archiviati nella stessa cartella Drive per lavoratore e tipo. La nuova funzione document-scan-archive verifica identità, cartella e SHA-256 con rilettura dei byte. Mantiene l’ID della scansione per i successivi aggiornamenti; nessuna cancellazione dei moduli o degli originali. OAuth e refresh token rimangono sul backend. Status riservato ad amministratori attivi con sessione verificata; worker autenticato con chiave interna. Coda e funzioni di acquisizione riservate al backend, RLS per la lettura amministratore.

La migrazione non accoda record esistenti. Si accodano solo nuove scansioni o scansioni rigenerate dopo l’apertura dell’archivio. Il worker automatico usa la stessa lease globale di Drive e della chiusura mensile.

Presenze: invariata la regola dell’ultimo definitivo mensile e la pulizia dei settimanali dopo verifica delle due copie su Drive.

Test con soli documenti fittizi:

- `node tests/document-scan-backend.test.cjs` (Node 24+)
- `node tests/pdf-scan.test.cjs`

Verificato anche in Chromium con un PDF fittizio di due foto e con un PDF senza allegati; entrambi generano due pagine elaborate nell’ordine corretto.
