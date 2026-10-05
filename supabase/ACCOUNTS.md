# Account facoltativi — configurazione e verifica

## Stato e architettura

Account facoltativi pronti per il rilascio su Cloudflare Workers. Le prove automatiche
usano PostgreSQL locale (PGlite) e un provider HTTP Supabase simulato su loopback;
il collaudo separato con Supabase remoto ha verificato signup, email reali, conferma,
login/logout, reset, RLS e username. I clic email e il nuovo login dopo reset sono stati
completati dal proprietario della casella. Gli utenti temporanei sono stati eliminati.
La verifica pubblica sul Worker deve essere completata dopo il deploy autorizzato.

Supabase Auth resta l'unico gestore delle identità. `@supabase/ssr` gestisce i cookie
`itispot_user` (anche in più parti), HttpOnly, Secure in produzione, SameSite=Lax,
durata 30 giorni. Non esistono token in localStorage, un browser client Supabase o
una seconda tabella di password. Il proxy Next aggiorna le sessioni prima del render;
`getUser()` verifica l'utente sul server. Risposte account e pagine personalizzate non
devono essere memorizzate in cache condivise. L'email non viene serializzata nel profilo.

Il cookie admin `itispot_session`, `ADMIN_USER_IDS` e tutte le API Spot restano separati.
Gli endpoint account usano la publishable key e il JWT dell'utente: gli aggiornamenti
di `profiles` sono quindi soggetti a RLS, senza service role. Gli Spot non hanno alcun
campo, riferimento o elenco per autore. I limiti account riusano l'HMAC e il servizio
rate limit esistenti, con scope distinti; non aggiungono raccolta IP o analytics.

## Schema

`profiles`: `id` UUID riferito ad Auth con cancellazione a cascata, `username`,
`avatar_key` (solo NULL per questo step), `created_at`, `updated_at`.
Username salvati in minuscolo: ASCII 3–20, lettere/numeri/underscore/punto; indice
unico `lower(username)`. La validazione DB blocca i nomi riservati anche con separatori,
numeri o sostituzioni comuni (`ad.min`, `ADMIN12`, `ad_m1n`, `ro0t`).

Il trigger crea il profilo nella stessa transazione dell'utente Auth. Se username
manca, è invalido o duplicato, l'intera creazione fallisce. Non copia ruoli da metadata.
Gli utenti già esistenti ricevono `user_` seguito da 15 caratteri del proprio UUID,
con la data originale di Auth; possono scegliere successivamente lo username.
La migration non cambia password, identità, privilegi o dati degli Spot.
Una collisione durante il backfill annulla la migration: verificare, non cancellare dati.

Anon può leggere soltanto username/avatar. Authenticated può leggere il profilo e
modificare solo la propria colonna username. Nessun INSERT/DELETE client; policy
restrittive difendono da eventuali grant/policy troppo ampi. ID e data creazione sono
immutabili anche tramite trigger. Funzione di creazione SECURITY DEFINER con
search_path vuoto e EXECUTE revocato ai client. Nessuna tabella di ruoli.

`created_at` è attendibile per una futura campagna OG SPOTTER; la data di lancio e
l'intervallo di 14 giorni non sono ancora impostati. Nessun badge assegnato.

## Passaggi manuali (prima di un collaudo remoto; nessun deploy automatico)

1. In Supabase **SQL Editor**, rivedere ed eseguire soltanto
   `migrations/20261004000100_accounts_profiles.sql` sul progetto ITISpot.
   La migration è transazionale e riapplicabile; crea profili anche per gli utenti
   Auth esistenti. Non usare lo snapshot completo per questo aggiornamento.
2. Eseguire `verify.sql`: devono apparire sia il PASS profili sia quello Spot/Storage.
   Non occorre condividere righe di profili o credenziali: solo esito o errore SQL.
3. **Authentication → Sign In / Providers**: registrazioni consentite, provider
   Email attivo, **Confirm email** attivo. Password minimum length: almeno 10,
   coerente con l'app (la policy Supabase protegge anche l'accesso diretto all'API Auth).
   Non abilitare anonymous sign-ins: un visitatore ITISpot non richiede un utente Auth.
4. **Authentication → URL Configuration**:
   - Site URL: `https://itispot.dpdns.org`
   - Redirect URL esatto: `https://itispot.dpdns.org/auth/confirm`
   - Solo per il collaudo locale: `http://127.0.0.1:3187/auth/confirm`.
   Evitare wildcard su domini esterni. L'app ignora `next` e torna esclusivamente
   a `/profilo` o `/reset-password`.
5. **Authentication → Email Templates**: aggiornare Confirm signup e Reset password
   con i file `email-templates/confirm-signup.html` e `email-templates/reset-password.html`.
   I link usano `TokenHash` e la pagina di conferma server; il token viene consumato
   solo dopo il clic “Conferma e continua”, non dalla scansione automatica dell'email.
6. **Authentication → Email / SMTP Settings**: verificare un SMTP personalizzato
   per email a utenti esterni e il mittente verificato. Il servizio email predefinito
   Supabase è limitato e non costituisce un invio pubblico pronto. Non condividere
   password SMTP in chat. Nessun cambio SMTP viene effettuato dal codice.
7. Comunicare solo l'esito delle configurazioni. Eseguire poi il collaudo reale con
   account di prova esplicitamente identificati e rimuoverli al termine. Nessuna
   migration o impostazione remota è stata applicata automaticamente da questo step.

Il reset crea una normale sessione Supabase verificata: `/reset-password` e l'API
richiedono un utente autenticato con email confermata. Anche un utente già autenticato
può impostare una nuova password. Logout invalida la sessione corrente, senza terminare
le altre sessioni Supabase (inclusa quella admin, se presente).

## Variabili

Nuovo requisito per account: `SUPABASE_PUBLISHABLE_KEY`, presente in `.env.local` e già configurata
nel runtime Worker production (verificata prima del rilascio).
Riusate: `SUPABASE_URL`, `APP_ORIGIN`, `ITISPOT_MODE`, `RATE_LIMIT_SECRET`,
`TRUSTED_IP_HEADER`. Restano necessari i parametri esistenti di Spot/admin/Turnstile.
Tutte sono lette sul server; nessun nuovo `NEXT_PUBLIC_*`, nessuna chiave Auth nel JS
client. `SUPABASE_SERVICE_ROLE_KEY` resta riservata al backend Spot/admin esistente.

## Test ripetibili

`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`,
`npm run build:worker`, `npm run db:schema:check`.

I test browser avviano un provider di contratto locale (`tests/fixtures/account-provider.mjs`)
e sovrascrivono URL/chiavi con valori fittizi: non contattano Supabase production.
Le email vengono simulate in memoria; la rotazione dei cookie usa il vero SDK SSR.
Le policy vengono eseguite separatamente in PostgreSQL, con ruoli anon/authenticated.
Screenshot in `../itispot-accounts-preview`, fuori dal repository.

Audit remoto, consegna email reale, conferma link, reset reale e sessione con Supabase
production sono stati collaudati prima della release. Il collaudo successivo al deploy
deve verificare nuovamente questi flussi sul dominio pubblico; non è sostituito dai test locali.

Il bundle OpenNext è stato anche eseguito con Wrangler/workerd locale: render SSR,
redirect anonimo, cookie HttpOnly/Secure, rotazione refresh e Cache-Control no-store
sono passati sia con provider simulato sia con Supabase remoto reale. OpenNext 1.20.7 segnala ancora il supporto Node
middleware (proxy Next 16) come sperimentale: ricontrollarlo nel successivo staging.


## File di questo step

- Dipendenze: `package.json`, `package-lock.json` (`@supabase/ssr`).
- Sessione e validazione: `src/lib/account-client.ts`, `src/lib/account.ts`,
  `src/lib/account-validation.ts`, `src/proxy.ts`.
- API: `src/app/api/account/[action]/route.ts`.
- Pagine: `src/app/login/page.tsx`, `src/app/registrati/page.tsx`,
  `src/app/profilo/page.tsx`, `src/app/password-dimenticata/page.tsx`,
  `src/app/reset-password/page.tsx`, `src/app/auth/confirm/page.tsx`.
- Componenti: `src/components/AccountForm.tsx`, `AccountShell.tsx`, `AccountNav.tsx`,
  integrazione in `PortalShell.tsx`; CSS aggiunto a `src/app/globals.css`.
- Privacy: `src/app/privacy/page.tsx`.
- Database/documentazione: migration `20261004000100_accounts_profiles.sql`,
  snapshot `supabase/schema.sql`, `supabase/verify.sql`, `supabase/README.md`,
  questo file, due template in `supabase/email-templates/`, `.env.example`.
- Test: `tests/accounts-api.test.ts`, `tests/accounts-database.test.ts`,
  `tests/accounts.e2e.ts`, `tests/fixtures/account-provider.mjs`,
  aggiornamenti a `tests/api.test.ts`, `tests/database.test.ts`,
  `tests/workflow.e2e.ts`, `playwright.config.ts`.

Le modifiche locali precedenti a Turnstile, config/security e relativi test sono
preservate fuori dalla release account. Il codice Spot/admin/Turnstile distribuito
rimane quello precedente; nessuna migration viene applicata durante il deploy.
