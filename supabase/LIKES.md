# Like V1 e archivio

Migration: `20261010000100_spot_likes.sql`. Solo locale in questa release: applicare manualmente dopo revisione, prima del collaudo remoto. Nessun dato Spot viene aggiornato.

`spot_likes(spot_id,user_id,created_at)` ha PK composta e FK con cascade. I like sono interazioni, non attribuzione dello Spot. Nessuna colonna autore in `spots`, nessun premio per importazioni o invii.

Le tabelle non sono leggibili/scrivibili direttamente da anon/authenticated. `spot_like_stats` fornisce solo conteggio e stato del chiamante; `set_spot_like` è accessibile ad authenticated, deriva UID da `auth.uid()`, valida visibilità dello Spot, acquisisce lock e applica 30 operazioni/minuto/account. Il backend verifica anche email confermata e Origin. Payload strict: solo spot_id, liked. POST idempotente sullo stato desiderato, doppio invio non incrementa. Rimuovere e riaggiungere crea una nuova interazione, conteggiata una sola volta.

Trending: like tuttora presenti con `now()-7 giorni <= created_at <= now()`. Esclusi Spot pending/rejected/archiviati. Pareggi: data originale Spot decrescente, poi UUID decrescente. Nessun risultato se nessun like settimanale. Uno Spot storico può diventare trending grazie a nuovi like, mai tramite la data di importazione.

Archivio `/spotted`: 24 record/pagina; ricerca letterale case-insensitive; recenti, totale like, commenti visibili. `/novita` resta un alias e conserva query/paginazione. `/spotted/[id]` riusa SpotCard e ricontrolla visibilità. Home contiene solo le finestre riepilogative, non il feed. Date originali preservate.

Gli aggregati usano indici (PK per Spot, indice settimana, commenti visibili) senza trasferire l'archivio intero al client. Nessuna lista pubblica di liker. Valutare materializzazione dei contatori solo quando i volumi reali la richiederanno.

Nessuna nuova variabile ambiente. Eseguire verify.sql dopo le migration, poi collaudo remoto prima del deploy.
