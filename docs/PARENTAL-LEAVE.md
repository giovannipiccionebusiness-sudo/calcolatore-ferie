Congedo parentale: scegliere il tipo nei moduli cartacei, aggiungere le foto nell’ordine delle pagine e premere Invia documento. Massimo 10 foto e 12 MB per PDF complessivo, comprese le foto originali allegate. In alternativa caricare un solo PDF già pronto. Il mese di riferimento è quello selezionato nelle presenze.

Le pagine sono conservate sul dispositivo per account. La bozza finale usa il recupero invii esistente e lo stesso UUID nei tentativi di rete. La verifica del congedo è una presa visione, senza aggiungere l’autorizzazione prevista solo per ferie e ROL.

Backend: nuova categoria nel vincolo documents_category_check; unica modifica Edge Function: mapping congedo_parentale nella cartella Drive Congedo parentale. Nessuna modifica a OAuth, sessioni, credenziali, policy o alle altre categorie. Migrazione già applicata; deploy Edge Function e promozione frontend su main in attesa di approvazione.

Test con soli documenti fittizi: node tests/multipage.test.mjs e node tests/capture.test.cjs.
