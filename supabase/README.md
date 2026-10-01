# Supabase per ITISpot

## Stato e confine di questo step

Il progetto Supabase non è ancora stato creato. Le migration e i test sono pronti nel repository;
non sono stati applicati a un database remoto e non sono state configurate chiavi sul Worker.
Turnstile non viene attivato né aggirato: anche dopo aver collegato Supabase, il form e il login
pubblici restano in preparazione finché i controlli anti-spam richiesti non sono configurati.

## Architettura conservata

Visitatore senza account → `POST /api/spots` → validazione, anti-spam e conversione → Supabase.
Amministratore → login server con Supabase Auth → cookie HttpOnly → verifica `getUser(token)`
e UUID in `ADMIN_USER_IDS` su ogni API → database/Storage attraverso il backend.

Il browser non usa direttamente il client Supabase. Non servono `SUPABASE_ANON_KEY`, una
publishable key o `NEXT_PUBLIC_SUPABASE_*`. Non esiste una tabella di autori, profili o account
dei visitatori; gli admin sono utenti di `auth.users`, gestita da Supabase, non una terza tabella custom.

La service role bypassa RLS: la verifica admin è quindi una responsabilità delle API server,
non una proprietà del token service role. Nessun accesso si basa sul solo frontend.
La service key non viene mai condivisa con gli admin nel browser. La lista autorizzata rimane
quella esistente, `ADMIN_USER_IDS`, senza duplicarla in una seconda fonte di autorizzazioni.

## Schema definitivo

### `public.spots`

| Colonna | Tipo | Regola |
| --- | --- | --- |
| `id` | uuid, PK | Casuale, generato sul server; immutabile |
| `text` | text, NOT NULL | Testo non vuoto, massimo 500 caratteri nel DB |
| `status` | text, NOT NULL | `pending`, `approved`, `rejected`; il trigger forza sempre `pending` all'inserimento |
| `image_path` | text, nullable | Esclusivamente `<id>.webp`, oggetto privato; mai URL pubblico o nome originale |
| `created_at` | timestamptz, NOT NULL | Creazione; immutabile |
| `updated_at` | timestamptz, NOT NULL | Aggiornato automaticamente dal DB |
| `archived_at` | timestamptz, nullable | Archivio separato dallo stato; ripristinare non cambia la moderazione |
| `reviewed_at` | timestamptz, nullable | NULL per pending; data dell'ultima decisione per approved/rejected |
| `rejection_reason` | text, nullable | 1–500 caratteri, solo se rejected; riservato e opzionale |

Il motivo è supportato dal database; l'interfaccia esistente non lo richiede e non è stata modificata.
Le azioni dell'app senza motivo salvano NULL. Approvare non crea una pubblicazione, un URL pubblico
o una policy di lettura. Per righe storiche già moderate, `reviewed_at` usa il vecchio `updated_at`
come approssimazione documentata, senza inventare l'istante originale della revisione.

### `public.rate_limits`

`key text PRIMARY KEY`, `count integer NOT NULL`, `reset_at timestamptz NOT NULL`.
La chiave contiene ambito e HMAC giornaliero dell'IP, mai l'IP in chiaro. Non compare negli Spot
né nelle risposte admin. RPC atomica `consume_rate_limit`; RPC di lettura paginata `list_spots_page`.
Entrambe sono invoker, con search path vuoto e EXECUTE solo alla service role.

## Migration, in ordine

1. `migrations/20260930000100_existing_spots.sql`: baseline del precedente schema, dati conservati.
2. `migrations/20260930000200_review_metadata.sql`: metadati, vincoli e trigger di revisione.
3. `migrations/20260930000300_private_access.sql`: privilegi minimi, RLS, bucket e RPC protette.

Ogni file è transazionale e riapplicabile. `schema.sql` è la concatenazione generata degli stessi
file, utile al SQL Editor. Rigenerarla con `npm run db:schema`; controllarla con `npm run db:schema:check`.
Le migration non eliminano Spot, oggetti Storage o policy di altri bucket. Un percorso immagine
preesistente non conforme fa fallire e annullare la seconda migration: verificare la riga, senza
cancellarla automaticamente. Prima di applicare a un progetto già popolato, fare un backup.

## RLS e Storage

| Chiamante | Database e RPC | Bucket `spot-images` |
| --- | --- | --- |
| Visitatore / ruolo `anon` | Nessun accesso diretto | Nessun listing, lettura, upload, modifica o eliminazione |
| Utente Auth / ruolo `authenticated` | Nessun accesso diretto, anche se admin | Nessun accesso diretto |
| Backend con service role | CRUD dopo i controlli server; RPC autorizzate | Upload/download/delete privati |
| Admin autorizzato via `/api/admin/*` | Coda e moderazione, dopo verifica Auth e allowlist | Immagine tramite proxy admin con `private, no-store` |

`spots` e `rate_limits` hanno ENABLE/FORCE RLS, revoca dei grant a PUBLIC/anon/authenticated
e policy restrittive di diniego. Le policy restrittive Storage riguardano solo `spot-images`,
così eventuali policy permissive generali non aprono quel bucket e gli altri bucket non cambiano.

Bucket: **privato**, ID `spot-images`, limite **10 MiB = 10485760 byte**, MIME **solo `image/webp`**.
Il form continua ad accettare JPG/PNG/HEIC/HEIF fino a 10 MiB. Il backend verifica e converte i file,
elimina EXIF/GPS e salva solo WebP; per questo non vanno aggiunti quei MIME originali al bucket.
I nomi sono UUID casuali, con upload senza sovrascrittura. Nessun signed URL o URL pubblico è emesso.

**Un'unica sorgente permanente: Supabase Storage.** Il binding Cloudflare Images già esistente
elabora le foto su Workers; non è un secondo archivio. In locale lo stesso compito è svolto da Sharp.
Questi convertitori non sono modificati in questo step. L'abilitazione e il collaudo del binding
Cloudflare sull'account restano un prerequisito per l'upload sul Worker.

## Creazione manuale, passo per passo

1. Aprire <https://supabase.com/dashboard>, accedere e scegliere **New project** nell'organizzazione desiderata.
2. Chiamare il progetto **ITISpot**, scegliere la regione e impostare personalmente la password del database.
   Conservarla nel password manager; non inviarla in chat. Verificare il piano scelto prima di confermare.
3. Attendere che il progetto sia pronto. Lasciare abilitata la Data API: il codice usa REST e RPC.
4. In **SQL Editor → New query**, incollare l'intero `supabase/schema.sql` ed eseguirlo.
   Controllare che non ci siano errori; questo applica in ordine le tre migration. Non creare tabelle a mano.
5. In una nuova query eseguire `supabase/verify.sql`: deve risultare
   `ITISpot schema, grants, RPC and Storage checks passed`. Non legge né mostra contenuti degli Spot.
6. In **Storage**, verificare `spot-images`: Private, limite 10485760 byte, MIME `image/webp`.
   Non renderlo pubblico, non aggiungere policy di upload o lettura pubbliche e non cancellare oggetti via SQL.
7. In **Authentication**, disabilitare le nuove registrazioni e il login anonimo. Creare manualmente gli utenti
   amministratori in **Users → Add user**, con email/password e email confermata. Le credenziali le imposti tu.
8. Copiare gli UUID di questi utenti in `ADMIN_USER_IDS`, separati da virgole. Impostare la durata JWT a
   3600 secondi o meno. Non occorrono provider social o una registrazione pubblica degli studenti.
9. Dal pannello **Connect / Data API** copiare il **Project URL** in `SUPABASE_URL`.
   Da **Settings → API Keys** copiare una **secret key server** (`sb_secret_…`) oppure la service_role legacy
   nella variabile esistente `SUPABASE_SERVICE_ROLE_KEY`. Il nome della variabile resta uguale.
   Non usare una publishable/anon key al suo posto. Non incollare mai la chiave in chat.
10. Creare localmente `.env.local` da `.env.example`, compilare i tre valori Supabase/Admin e usare
    `ITISPOT_MODE=supabase`. Il file è escluso da Git. Eseguire `npm run check:supabase`: è un controllo
    di sola lettura su schema, RPC, bucket e utenti admin, indipendente da Turnstile.
11. Nel Worker Cloudflare esistente **itispot → Settings → Variables and Secrets**, configurare gli stessi
    tre valori; `SUPABASE_SERVICE_ROLE_KEY` deve essere un **Secret**. Salvare/pubblicare la configurazione
    secondo il pannello. Non mettere chiavi nelle variabili di build e non compilare Turnstile in questo step.
12. Quando il backend è attivo, impostare una pulizia giornaliera con Supabase Cron:
    `delete from public.rate_limits where reset_at < now();` (pulisce solo contatori scaduti).

Puoi comunicarmi solo il **Project URL**, gli **UUID admin** e l'esito delle query/verifiche.
Le chiavi private e le password vanno configurate nei campi segreti o nel file locale ignorato.

### Alternativa: applicare con Supabase CLI

Usare questo percorso **al posto** del SQL Editor per mantenere subito la cronologia CLI:

```sh
npx supabase init
npx supabase login
npx supabase link --project-ref <PROJECT_REF_REALE>
npx supabase db push --dry-run
npx supabase db push
```

Eseguire dalla radice del repository. `PROJECT_REF_REALE` è l'ID copiato dal proprio progetto,
non il nome ITISpot. Non usare `db reset` sul database remoto. Credenziali inserite solo nei prompt appropriati.
Se lo schema è stato applicato manualmente, prima di passare alla CLI verificare che tutte e tre le migration
siano effettivamente presenti ed eseguire `verify.sql`; poi allineare la cronologia con
`supabase migration repair --status applied 20260930000100 20260930000200 20260930000300 --linked`.
Non segnare una migration come applicata se la relativa query non è riuscita.

## Variabili effettivamente usate

| Nome | Locale | Worker Cloudflare | Esposizione |
| --- | --- | --- | --- |
| `ITISPOT_MODE` | `demo` per demo oppure `supabase` | `supabase` | Configurazione server |
| `SUPABASE_URL` | Project URL reale in `.env.local` | Stesso URL | Non segreto, usato solo dal server |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret server reale in `.env.local` | **Secret** | **Mai nel client, Git o chat** |
| `ADMIN_USER_IDS` | UUID Auth consentiti | Stessi UUID | Configurazione server, non lista pubblica |
| `APP_ORIGIN` | `http://127.0.0.1:3187` | `https://itispot.itispotted-official.workers.dev` | Origine pubblica, controllo server |
| `RATE_LIMIT_SECRET` | Segreto casuale ≥32 caratteri per modalità Supabase | **Secret** distinto per ambiente | **Mai nel client** |
| `TRUSTED_IP_HEADER` | Solo se un proxy fidato lo sovrascrive | `cf-connecting-ip` | Server; non abilitare fiducia arbitraria su un Node esposto |
| `DATA_DIR` | Solo demo, `.data` | Non necessario | Filesystem demo |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Lasciare vuoto in questo step | Non attivare ora | Pubblica quando configurata successivamente |
| `TURNSTILE_SECRET_KEY` | Lasciare vuoto in questo step | Non attivare ora | **Secret, mai client** |
| `TURNSTILE_HOSTNAME` | Non configurare ora | Non configurare ora | Server |
| `OPERATOR_NAME`, `CONTACT_EMAIL` | Dati reali del gestore quando disponibili | Dati reali del gestore | Mostrati intenzionalmente nella privacy |

`ITISPOT_RUNTIME` è scelto dalla build, `ITISPOT_DIST_DIR` serve ai test; non sono credenziali da configurare.
Il preflight `check:supabase` richiede soltanto URL, chiave server e UUID admin. Il flusso pubblico
richiede anche i controlli esistenti: **non aggiungere chiavi Turnstile fittizie e non disattivare il guard**.

## Verifiche e limiti

```sh
npm run db:schema:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run build:worker
```

I test SQL eseguono migrazioni, upgrade, riapplicazione, RLS e RPC su PostgreSQL locale (PGlite).
Le tabelle Storage sono modellate per testare le policy: questo non avvia il servizio Storage reale.
I test Supabase del flusso usano l'SDK reale con HTTP Auth/Storage/Data API e Turnstile simulati.
I browser test esistenti usano la demo isolata. Nessuna di queste prove certifica il collegamento a un account remoto.

Dopo la creazione, eseguire preflight e audit SQL. In un successivo step, dopo la configurazione
dei controlli anti-spam, collaudare sul Worker un testo e una foto sintetica: risposta 201, riga pending,
coda admin, foto non accessibile senza cookie, rifiuto/approvazione/archivio/ripristino/eliminazione e 503
in caso di indisponibilità. L'approvazione deve lasciare la foto privata. Non usare dati di studenti per il test.

Database e Storage non hanno una transazione condivisa: resta il recupero già previsto degli upload
falliti e l'eventualità di un file orfano se anche la pulizia fallisce. Non è stata introdotta una seconda
sorgente Storage o una nuova funzione per la gestione degli orfani.

Riferimenti ufficiali: [RLS e privilegi](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Storage privato](https://supabase.com/docs/guides/storage/security/access-control),
[chiavi server](https://supabase.com/docs/guides/getting-started/api-keys),
[cronologia migration](https://supabase.com/docs/guides/deployment/database-migrations).
