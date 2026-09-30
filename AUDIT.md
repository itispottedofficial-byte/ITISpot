# Verifica ITISpot — 30 settembre 2026

## Completo e verificato localmente

- Repository originale `main`, architettura Next.js/TypeScript e grafica Y2K conservati.
- Invio testo e foto, ricevuta, stato sempre pending, nessuna pubblicazione automatica.
- Demo persistente e dashboard con ricerca per testo/ID, filtri e paginazione da 24 elementi.
- Immagini private, moderazione completa e conferma prima dell’eliminazione.
- Conversione Node JPG/PNG/HEIC, limite file/pixel, rimozione metadati; fixture HEIC sintetica.
- Validazione e limite corpo richiesta sul server, Origin/CSRF, honeypot, cookie protetti.
- Schema Supabase riapplicabile con privilegi riservati, bucket privato, trigger pending, rate limit atomico e paginazione SQL.
- Turnstile con verifica server di action e hostname; login riservato agli UUID autorizzati.
- Produzione senza configurazione: invii e login bloccati, nessun fallback a demo pubblica.
- Adattatore OpenNext per lo stesso Worker, con comando `npx wrangler deploy` mantenuto.
- Leggibilità e controlli mobile migliorati; schermate e interazioni conservano il design originale.

## Risultati delle verifiche

| Verifica | Risultato |
| --- | --- |
| Vitest | 30 test superati, 3 file |
| SQL su PostgreSQL PGlite | trigger pending, permessi, limite concorrente, paginazione oltre 1000 e ricerca letterale verificati |
| Playwright Chromium | 3 test superati; percorso completo da smartphone, foto privata, tutte le azioni admin, HEIC e responsive |
| Viewport | home/login/privacy a 320, 390, 768 e 1440 px; dashboard autenticata anche a 320 e 390 px; nessun overflow orizzontale |
| TypeScript | superato |
| Build Next.js | superata |
| Build OpenNext/Worker | superata |
| Runtime workerd locale | home 200, invio 503 con messaggio atteso senza configurazione |
| Formattazione e git diff | controlli superati |

Gli screenshot del browser sono in `test-results/` (ignorati da Git). Le risposte Auth/Storage Supabase e Siteverify usate nei test provider sono simulate. Le prove SQL eseguono lo schema su PostgreSQL locale, non sul progetto Supabase dell’utente.

## Da configurare / collaudare sui servizi reali

- Supabase: progetto, schema SQL completo, utenti admin, UUID, URL e chiave server.
- Turnstile: widget, hostname e chiavi.
- Worker: variabili e segreti, binding Images e relativa disponibilità/tariffazione nell’account.
- Conversione e salvataggio foto nel vero Worker: il binding è predisposto, ma il collaudo end-to-end sul provider non è stato possibile senza configurazione. La conversione HEIC verificata è quella Node.
- Gestore, recapito, tempi di conservazione e informativa per l’uso effettivo.
- Pulizia programmata degli hash scaduti su Supabase.

## Problema pubblico osservato

Da questo ambiente, `https://itispot.itispotted-official.workers.dev` risponde HTTP 404 con corpo `error code: 1042`. Questo non dimostra da solo la causa: controllare il Worker esistente e i suoi log di deploy nell’account. Il codice locale aggiornato non è stato pubblicato; nessun servizio a pagamento attivato e nessun segreto aggiunto al repository.

## Prossimo blocco

Seguire il README per completare i servizi, poi eseguire il collaudo HTTPS sullo stesso Worker prima di raccogliere contenuti reali. Restano espliciti i limiti di revoca degli access token Supabase, le operazioni non atomiche tra DB e Storage e la conservazione dei backup descritti nel README.
