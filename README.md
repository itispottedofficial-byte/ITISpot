# ITISpot

**Say it. Stay anonymous.** Web app Next.js 16 / React 19 / TypeScript, stile Y2K blu e chrome. Il repository e il Worker esistenti sono mantenuti.

Gli utenti inviano testo anonimo (1–500 caratteri) e, opzionalmente, una foto. Ogni Spot nasce **pending**, anche a livello database. Solo gli amministratori autorizzati possono leggerlo e moderarlo. Approvare **non pubblica**: questo MVP non ha un feed pubblico.

## Avvio della demo locale

Richiede Node.js 22 o successivo e npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Apri <http://127.0.0.1:3187>. Usa lo stesso hostname di `APP_ORIGIN`: `localhost` e `127.0.0.1` sono origini diverse.

- `/`: form, anteprima, contatore, consenso, ricevuta con ID, regole.
- `/admin`: **Entra nella demo**, ricerca per testo/ID, filtri, pagine da 24 Spot, anteprima privata, approva/rifiuta/archivia/ripristina/elimina con conferma.
- `/privacy`: funzionamento tecnico, limiti dell’anonimato e contatti del gestore.
- I dati della demo persistono in `.data/store.json` e `.data/images/`. Non sono versionati. Non cancellarli per aggiornare il codice.

La demo è aperta a chi raggiunge il server locale: usare solo contenuti di prova. In `NODE_ENV=production` le API rifiutano la modalità demo. Non esiste fallback ai file locali in caso di errore Supabase.

## Stato verificato e limiti

Sono presenti test di API, SQL PostgreSQL e browser. Il flusso completo della demo, le immagini JPG/PNG/HEIC, la moderazione e il responsive sono verificabili con i comandi sotto. I test Supabase Auth/Storage e Turnstile simulano le risposte dei provider: **non sostituiscono un collaudo con il proprio account**.

Supabase e Turnstile non sono ancora configurati per questo progetto. In produzione, con configurazione mancante, il sito mostra un messaggio di preparazione e blocca invio e login. La build riuscita non prova un collegamento ai servizi reali.

## Collegare Supabase

1. Nel proprio progetto Supabase, eseguire **tutto** `supabase/schema.sql` nel SQL Editor. Lo script è riapplicabile e conserva gli Spot. Include tabella, vincoli, trigger `pending`, rate limit atomico, ricerca paginata e bucket privato `spot-images`.
2. Non aggiungere policy pubbliche su `spots`, `rate_limits` o sul bucket. Le tabelle hanno RLS attiva e accesso revocato a `anon` e `authenticated`; le API server usano la service role.
3. In Authentication creare gli utenti amministratori con email/password, confermare le email e disabilitare la registrazione pubblica. Non esiste una pagina di registrazione nell’app.
4. Copiare gli UUID di quegli utenti in `ADMIN_USER_IDS`, separati da virgole. Conoscere una password Supabase senza essere nella lista non dà accesso.
5. Impostare le variabili riportate sotto. La service role va esclusivamente tra i segreti del Worker, mai in `NEXT_PUBLIC_*`, in file versionati o in chat.
6. Impostare la durata degli access token Auth a 3600 secondi o meno. Il cookie dell’app dura un’ora, è HttpOnly, SameSite Strict e Secure in produzione. Non viene conservato un refresh token nel browser.
7. In Supabase Cron programmare una pulizia giornaliera: `delete from public.rate_limits where reset_at < now();`. Il contatore scaduto si azzera comunque alla richiesta successiva; la pulizia elimina gli hash inutilizzati.

L’app verifica l’utente e la lista degli UUID su ogni API admin. Il logout rimuove il cookie e revoca la sessione tramite Supabase. Come previsto da [Supabase Auth](https://supabase.com/docs/guides/auth/signout), un access token già emesso può restare valido fino alla sua scadenza: per revocare subito l’accesso all’app, rimuovere anche l’UUID da `ADMIN_USER_IDS`.

## Collegare Turnstile

Creare un widget nel proprio account Cloudflare e autorizzare il nome host effettivo, per esempio `itispot.itispotted-official.workers.dev` (senza protocollo o percorso).

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: site key pubblica, passata dal server al componente.
- `TURNSTILE_SECRET_KEY`: chiave privata, solo sul Worker.
- `TURNSTILE_HOSTNAME`: hostname esatto restituito da Turnstile, uguale al nome host di `APP_ORIGIN`.

La verifica avviene sul server: controlla successo, hostname e azione (`spot-submit` o `admin-login`). Un token scaduto, riutilizzato o non valido blocca l’operazione. Gli errori permettono di riprovare senza perdere il testo. Non inviamo l’IP al servizio Siteverify.

Il widget usa il formato compatto nei contenitori stretti. Per test locali con servizi reali occorre un hostname autorizzato e un proxy attendibile: non disattivare i controlli per far passare la prova.

## Worker Cloudflare esistente

Il file `wrangler.jsonc` punta al Worker **itispot**. Il comando di deploy già configurato resta:

```sh
npx wrangler deploy
```

La sezione `build.command` esegue `npm run build:worker`, che compila Next.js con OpenNext per Workers. `keep_vars: true` conserva le variabili impostate nel pannello; i segreti non sono nel repository. Non serve creare un nuovo Worker, repository o collegamento GitHub.

Se la radice del repository GitHub contiene direttamente `package.json`, quella è la directory di build: il percorso locale `outputs/itispot` non va aggiunto alla configurazione remota.

### Variabili runtime sul Worker

| Nome | Valore / uso |
| --- | --- |
| `ITISPOT_MODE` | `supabase` |
| `APP_ORIGIN` | `https://itispot.itispotted-official.workers.dev` oppure il dominio definitivo, senza percorso |
| `SUPABASE_URL` | URL HTTPS del proprio progetto |
| `SUPABASE_SERVICE_ROLE_KEY` | **Segreto** server Supabase |
| `ADMIN_USER_IDS` | UUID admin separati da virgole |
| `RATE_LIMIT_SECRET` | **Segreto** casuale di almeno 32 caratteri; generarlo con un password manager |
| `TRUSTED_IP_HEADER` | `cf-connecting-ip` su Workers |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site key pubblica del widget |
| `TURNSTILE_SECRET_KEY` | **Segreto** Turnstile |
| `TURNSTILE_HOSTNAME` | Stesso hostname di `APP_ORIGIN` |
| `OPERATOR_NAME` | Gestore responsabile, mostrato nella privacy |
| `CONTACT_EMAIL` | Recapito per richieste e segnalazioni, mostrato nella privacy |

`DATA_DIR` riguarda solo la demo Node. `ITISPOT_RUNTIME` è scelto automaticamente durante la build: non cambiarlo sul Worker. La site key Turnstile viene letta a runtime; non servono segreti durante la build.

### Immagini sul Worker

Sharp rimane il convertitore locale Node; il suo modulo nativo non può essere eseguito su Workers. Il percorso Cloudflare usa il binding **IMAGES** già dichiarato in `wrangler.jsonc`. Questo conserva l’architettura e supporta la conversione senza rendere pubblica la foto originale.

**Verificare l’abilitazione e la tariffazione di Cloudflare Images nell’account prima di pubblicare.** Le chiamate al binding sono conteggiate come trasformazioni; [documentazione e costi del binding](https://developers.cloudflare.com/images/optimization/binding/). Il progetto non attiva abbonamenti automaticamente.

La foto originale passa al convertitore; soltanto la WebP sanificata viene salvata nel bucket privato Supabase. La dashboard la recupera tramite `/api/admin/images/[id]`, con autorizzazione e `Cache-Control: private, no-store`. Nessun URL pubblico o signed URL permanente viene fornito al client.

```sh
npm run build:worker
npm run preview:worker
```

La preview usa il runtime locale Workers sulla porta 3188. Senza configurazione reale, mostra correttamente lo stato di preparazione (API 503). Non usare la preview HTTP locale per dimostrare cookie Secure di produzione. Il deploy finale deve essere provato sul vero hostname HTTPS.

Documentazione dell’adattatore: [OpenNext per Cloudflare](https://opennext.js.org/cloudflare/get-started).

## Validazione e protezioni

- Testo trim, 1–500 unità UTF-16 nel client/server; niente rendering HTML degli Spot. Il database impone inoltre una lunghezza di 1–500 caratteri.
- JPG/PNG/HEIC/HEIF, massimo 10 MiB per file e 40 megapixel. Il server controlla firma binaria, tipo consentito, decodificabilità e dimensioni; estensione e MIME da soli non bastano.
- Conversione in WebP, lato lungo massimo 1800 px, orientamento normalizzato in Node; rimozione EXIF/GPS/XMP/ICC e nome originale. Volti e scritte nella foto restano visibili.
- Limite del corpo della richiesta letto a streaming, anche senza `Content-Length`; JSON admin limitato a 4 KiB. Upload arbitrari, SVG ed eseguibili vengono rifiutati.
- Honeypot, consenso obbligatorio, Turnstile e rate limit: 5 tentativi di invio ogni 10 minuti per hash IP, 10 tentativi di login. Anche i tentativi non validi consumano il limite. Le reti scolastiche con IP condiviso condividono il limite.
- Hash HMAC giornaliero con segreto server; nessun IP in chiaro negli Spot o nella dashboard. Il proxy di hosting può comunque trattare IP e dati tecnici.
- Controllo Origin esatto e `Sec-Fetch-Site` sulle operazioni che modificano dati. Configurare un solo hostname canonico e redirigere gli altri.
- Accettare `TRUSTED_IP_HEADER` soltanto dietro il proxy che lo sovrascrive. Un server Node direttamente esposto non può fidarsi di header inviati dal chiamante.
- Cookie HttpOnly/Secure/SameSite Strict, allowlist UUID server, chiavi private protette da `server-only`, risposte admin non memorizzabili in cache.
- CSP, protezione framing, `nosniff`, referrer disattivato, nessuna analitica o pubblicazione automatica. CSP conserva `unsafe-inline` per il bootstrap Next; i testi utente restano sempre escaped da React.
- Errori dei provider senza segreti o contenuti nei log dell’app. L’osservabilità automatica del Worker è disabilitata nel file di configurazione.

## Gestione e privacy prima dell’apertura

Compilare gestore e recapito, definire i tempi di conservazione e completare l’informativa per il servizio effettivo. L’attuale pagina descrive l’MVP: non sostituisce queste decisioni. Gli Spot restano fino all’eliminazione manuale; l’archivio non è una cancellazione. I backup dei provider possono avere una conservazione separata.

L’eliminazione rimuove prima il file, poi la riga. Se il provider fallisce a metà, l’app restituisce un errore: aggiornare e riprovare; una foto già rimossa non viene ricreata. In caso di inserimento fallito, viene tentata la rimozione del file appena caricato. Dati e Storage non condividono una transazione: in caso di guasto persistente controllare gli eventuali file orfani nel bucket prima di una pulizia manuale.

Per abusi: usare l’ID della ricevuta per individuare lo Spot, rifiutare o eliminare il contenuto. Non aggiungere informazioni identificative per tentare di risalire all’autore. Non richiedere account agli studenti.

## Verifiche

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
npm run build:worker
```

- Vitest: API reali in demo con dati isolati, autorizzazione, CSRF, upload, EXIF, rate limit concorrente, sessioni e contratti provider.
- PGlite: SQL eseguito su PostgreSQL locale, RLS/privilegi, trigger pending, rate limit atomico, ricerca letterale e paginazione oltre 1.000 record.
- Playwright: server isolato sulla porta 3190, flusso mobile completo, immagine privata, moderazione, logout, HEIC, assenza di overflow a 320/390/768/1440 px. Screenshot in `test-results/`, esclusi da Git.
- La fixture HEIC è un rettangolo blu generato per il test, senza dati personali.

Il test browser usa `.next-e2e` e `.data/e2e-*`, senza toccare i dati della demo. Next rigenera `next-env.d.ts` in base alla build usata: una successiva `npm run build` lo riallinea alla build normale. Non eseguire build Node e Worker contemporaneamente perché condividono `.next`.

### Collaudo sul proprio account prima di raccogliere dati reali

1. Home e admin HTTPS raggiungibili, nessun errore di configurazione; credenziali errate e utenti fuori allowlist respinti.
2. Inviare uno Spot di prova, prima solo testo, poi JPG/PNG/HEIC: compare una volta, sempre pending, nel database privato.
3. Verificare che la foto senza cookie restituisca 401; controllare EXIF assenti dopo il download admin.
4. Provare tutte le azioni, cercare l’ID, cambiare pagina, eliminare anche il file Storage e uscire.
5. Provare un token Turnstile invalido e più tentativi fino al 429; non usare dati o immagini di studenti per il collaudo.
6. Controllare recapito, conservazione, accessi admin, costi Images e pulizia degli hash scaduti.

## Struttura

`src/app/` pagine e API; `src/components/` UI esistente; `src/lib/` validazione, sicurezza, repository, conversione immagini e provider; `supabase/schema.sql` schema idempotente; `tests/` verifiche; `scripts/build-worker.mjs` build Cloudflare.
