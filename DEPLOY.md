# Ripristino del deploy pubblico — 30 settembre 2026

## Diagnosi verificata nel pannello Cloudflare

Worker esistente: `itispot`, account `1291f65c68c3ca4dd574e9ee23cea9de`.

Prima della correzione il pannello mostrava **No URLs enabled**, `workers.dev Disabled`, nessun dominio personalizzato e nessuna route. Il browser pubblico mostrava “There is nothing here yet”; la richiesta HTTP restituiva 404 con `error code: 1042`. La versione attiva era `f80d3390`, generata dal vecchio repository; il commit locale `032482a` non era pubblicato.

Il codice applicativo non contiene fetch server verso il dominio ITISpot o `workers.dev`: i componenti chiamano API relative dal browser; il server usa direttamente repository e Supabase, e contatta solo Supabase e Siteverify Turnstile. Le pagine sono gestite direttamente dall’handler Next. L’adattatore legge gli asset tramite `ASSETS.fetch` e usa `WORKER_SELF_REFERENCE` per la coda interna, senza richiamare il proprio URL attraverso fetch pubblico.

**La causa accertata dell’indisponibilità è il routing pubblico disabilitato.** Il solo codice 1042 non consente di attribuire un particolare fetch al codice applicativo. Non è stato trovato un loop da riscrivere. [La documentazione Cloudflare](https://developers.cloudflare.com/workers/observability/errors/) descrive il significato generale del 1042; la diagnosi specifica qui deriva dallo stato effettivo del Worker e dal confronto con il browser.

## Correzione minima

- `workers_dev: true` esplicito nella configurazione versionata, per ripristinare e mantenere l’URL pubblico.
- Account e nome puntano allo stesso Worker già collegato a GitHub.
- `WORKER_SELF_REFERENCE` punta direttamente a `itispot`, conservando il binding già presente nel pannello e previsto da OpenNext.
- Asset e binding Images mantenuti. Variabili remote conservate con `keep_vars`.
- Osservabilità mantenuta attiva, come nello stato remoto esistente.
- Nessun nuovo compatibility flag: `global_fetch_strictly_public` era già presente sia localmente sia nel pannello. Il deploy conserva la configurazione Node necessaria a Next.
- Nessuna modifica a `src/`, design, form Invia Spot, SQL o logica applicativa rispetto a `032482a`.

Riferimenti: [routing workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [binding richiesti da OpenNext](https://opennext.js.org/cloudflare/get-started).

## Controlli prima della pubblicazione

- Lint Oxlint, compatibile con il TypeScript già presente: superato.
- Typecheck: superato. Il primo tentativo aveva rilevato copie duplicate nei file generati `.next/types`; la build li ha rigenerati senza modifiche ai sorgenti.
- 30 test automatici: superati.
- 3 browser test esistenti: superati. Gli screenshot mantengono il cursore originale per non aggiungere stili temporanei durante l’idratazione; il test rileva anche errori di idratazione in console.
- Build Next.js e OpenNext: superate.
- `wrangler deploy --dry-run`: superato, con ASSETS, IMAGES e WORKER_SELF_REFERENCE.
- Runtime locale workerd: home/admin/privacy e immagini HTTP 200; API HTTP 503 controllato senza servizi configurati; nessun 1042. Il test non crea Spot.

## Pubblicare tramite il collegamento esistente

Da questa directory, dopo i controlli:

```sh
git push origin main
```

Cloudflare Workers Builds usa già `main`, directory `/` e comando `npx wrangler deploy`. La build personalizzata compila l’output OpenNext: non serve una nuova infrastruttura.

In alternativa, su un terminale già autenticato all’account corretto:

```sh
npx wrangler deploy
```

Verifica HTTP successiva:

```sh
npm run check:deployment -- https://itispot.itispotted-official.workers.dev
```

## Configurazione ancora necessaria

Nel pannello non risultavano variabili o segreti runtime. Il sito deve quindi mostrare lo stato “in preparazione”, con invio e login disabilitati e API 503. Supabase, utenti admin, Turnstile, chiavi e variabili richieste sono elencati nel README. Il binding Images esiste già; il trattamento reale delle foto richiede il collaudo del servizio nell’account. Nessun contenuto reale viene inviato durante questo ripristino.
