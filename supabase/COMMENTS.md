# Commenti V1 — installazione e confini

Migration installata manualmente dal proprietario su Supabase production; `verify.sql` dichiarato PASS. Collaudo funzionale remoto completato il 7 ottobre 2026 usando il codice locale su `http://127.0.0.1:3187` e Supabase reale. Nessun deploy o commit effettuato durante il collaudo. Il frontend commenti pubblico resta da distribuire.

## Configurazione manuale, in ordine

1. Apri il progetto ITISpot in Supabase → SQL Editor.
2. Esegui **solo** `supabase/migrations/20261005000100_comments.sql`, dopo le migration Spot/profiles già installate. Lo script è transazionale e riapplicabile; non cancella i dati esistenti.
3. Esegui `supabase/verify.sql`. Deve terminare anche con `ITISpot comments, grants, RLS and RPC checks passed`.
4. Comunica l’esito dell’audit senza inviare chiavi o dati utenti. Questi passaggi sono già stati completati sul progetto attuale; non è necessario riapplicare la migration per il deploy del frontend.

Non sono necessarie nuove environment variables o modifiche a SMTP, Auth, Turnstile, Storage o domini. Si usano URL/key pubblicabile e service key già server-only, cookie account già esistenti e ADMIN_USER_IDS per l’admin.

Finché la migration manca, Home/Novità restano disponibili. Il pannello commenti mostra un errore controllato; non inventa un contatore zero. Il collaudo remoto ha usato due utenti temporanei e il login personale dell’admin nel solo runtime locale.

## Modello e privacy

- `comments`: UUID id, spot_id → spots (cascade), user_id → auth.users (cascade), content, status visible/hidden, created_at, updated_at. Nessun username/email/avatar duplicato.
- `comment_reports`: UUID id, comment_id → comments (cascade), user_id → auth.users (cascade), reason, created_at. Una sola segnalazione per account/commento.
- Nessun edit in V1. Eliminazione definitiva del proprio commento; anche l’admin può eliminare. Le segnalazioni associate vengono eliminate in cascata.
- Account eliminato: commenti e segnalazioni di quell’account vengono eliminati in cascata. Nessuna UI cancellazione account aggiunta.
- Username/placeholder avatar sempre derivati dal profilo corrente. Nessuna immagine remota controllata dall’autore caricata dal pannello.
- Gli Spot mantengono il proprio schema senza author/user/profile. La relazione commento → Spot non identifica chi ha inviato lo Spot.
- I client ricevono solo contenuto, username, avatar_key (attualmente null), data, ID operativo del commento e booleano `own`. UUID, email, IP o metadata Auth non sono stampati nella UI; UUID autore e segnalante non sono restituiti dal feed/RPC admin.

## Accesso, RLS e RPC

`comments` espone SELECT di sole colonne non identificative con policy permissiva + guardia restrittiva: visible e Spot approved/non archiviato. `user_id` e status non sono selezionabili dal client. Reports non leggibili direttamente dai browser. Nessuna scrittura diretta client sulle due tabelle, neppure aggiungendo accidentalmente una policy permissiva.

RPC con `SECURITY DEFINER`, nomi qualificati e `search_path=''`:

- `comment_spot_visible`, `list_comments`, `comment_counts`: anon/authenticated. Proiezione pubblica, join con profiles, pagine da 20 e contatori in batch da massimo 24 Spot.
- `create_comment`, `delete_own_comment`, `report_comment`: solo authenticated. Autore ricavato esclusivamente da auth.uid(); nessun parametro user_id, status o timestamp. Own-delete verifica l’ownership nella stessa operazione SQL. Create/report verificano visibilità del contenuto.
- `admin_comments_page`, `moderate_comment`: solo service_role, invocate esclusivamente da API protette con requireAdmin e allowlist esistente. Nessuna autorizzazione tramite username/email/metadata.

Non concedere INSERT/UPDATE/DELETE aggiuntivi ai ruoli browser e non concedere gli RPC admin ad authenticated. `verify.sql` controlla grants, RLS, cascades e le funzioni ammesse, senza disabilitare l’audit delle altre funzioni definer.

## Sicurezza e limiti

Il backend valida JSON strict e limitato, sessione/email verificata e Origin per le mutazioni. React rende il contenuto come testo: nessun HTML interpretato, Markdown, URL autolink o dangerouslySetInnerHTML. Unicode/emoji sono conservati, 1–500 caratteri dopo trim. Motivo segnalazione 3–300 caratteri.

Il rate limit riusa `consume_rate_limit` direttamente nella transazione SQL: **5 commenti/60 secondi per account**; **5 segnalazioni/10 minuti per account**. Vale anche per chiamate Supabase dirette e non dipende dall’IP. I contatori sono tecnici e privati: le finestre scadute non bloccano più gli invii. La rimozione fisica usa la pulizia periodica già prevista per `rate_limits`; questo step non presume che Supabase Cron sia configurato. Verificare il job esistente `delete from public.rate_limits where reset_at < now()` senza crearne un duplicato. Un errore o inserimento annullato non consuma la quota; cancellare un commento non la azzera.

La moderazione è successiva per i commenti; gli Spot continuano invece a nascere pending. Nascondere/archiviare/rifiutare uno Spot nasconde anche tutti i suoi commenti; ripubblicarlo non riattiva commenti esplicitamente nascosti dall’admin. I client già aperti si aggiornano alla riapertura/ricaricamento del pannello; niente realtime in V1.

## Test locali e preview

`npm test` usa PGlite/PostgreSQL reale in memoria per grants/RLS/RPC/trigger/cascade e fixture isolate per API. `npm run test:e2e` avvia soltanto server loopback con identità fittizie e lo stesso schema SQL in memoria: nessuna email, utente, Spot o richiesta Supabase remota. Il provider è in `tests/fixtures`, mai importato dal runtime o incluso nel bundle.

Screenshot in `../itispot-comments-preview/`, fuori dal repository. Local preview senza il provider di test richiede un progetto Supabase di sviluppo con le migration: non ci sono bypass Auth in demo per scrivere commenti.

## Confini del collaudo remoto

- Verificati con richieste reali: lettura anonima, grants negati (`42501`), filtro RLS dei commenti nascosti (risposta vuota), RPC authenticated, ownership, mass assignment, validazione, Unicode/XSS, username corrente, segnalazioni e deduplicazione, contatori e limite 5/60 con sesto tentativo HTTP 429.
- Verificati nel browser: pubblicazione tramite form, login/logout e sessione SSR, prompt anonimo, moderazione con l’admin esistente (nascondi/ripristina), responsive 375/768/1440. Il recupero password è stato provato sul solo account temporaneo con token generato privatamente da Supabase e consumato dal backend applicativo; nessuna nuova verifica SMTP richiesta.
- L’audit catalogo SQL remoto è quello eseguito manualmente dal proprietario (`verify.sql`: PASS); non è stato simulato un accesso SQL non disponibile. I test reali dei ruoli verificano inoltre i permessi effettivi.
- Eliminati entrambi gli utenti temporanei, profili/commenti/segnalazioni e contatori identificabili del test, comprese le fixture della sessione interrotta. Nessuno Spot reale modificato; admin conservato. I contatori preesistenti non attribuibili al test restano intatti.
- Non è un collaudo del frontend commenti sul Worker pubblico: quello richiederà il successivo deploy autorizzato. Nessuna nuova variabile ambiente necessaria.
