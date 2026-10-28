# Avviso inquadratura documento — versione ufficiale 60

Integrato il 28 ottobre 2026 dopo la verifica sul telefono e autorizzazione dell’utente. Base: versione ufficiale 21767a6, inclusi recupero password e tutti gli aggiornamenti precedenti. Non viene importata la funzione Organizza il tuo riposo.

Il controllo geometrico già provato sul test mostra «Sposta il telefono sopra il foglio» dopo un secondo di evidente deformazione prospettica. Sospende subito lo scatto automatico; dopo 600 ms di inquadratura corretta riparte il normale periodo di stabilità di due secondi. Scatto manuale, galleria e PDF restano disponibili. Contorni mancanti mantengono il messaggio esistente.

Conservate le dipendenze ufficiali live-detector v42 e scanner-core v35. Nessuna modifica a calcoli, dati, autenticazione, notifiche o backend. Aggiornati soltanto i riferimenti cache necessari. Il controllo rileva deformazioni dei quattro angoli, non misura l’angolo fisico del telefono.

Validazione: test geometria, temporizzazione e reset; regressioni calcoli ferie, pulizia immagini e PDF multipagina; controllo sintattico e confronto del diff con la base ufficiale. Fixture browser riproducibile in tests/fixtures/camera-angle-review.html.

Verifica browser con le dipendenze ufficiali: avviso sul documento sintetico inclinato, sospensione automatica, recupero sul foglio dritto e anteprima PDF con originale conservato: superata.
