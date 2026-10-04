# Turnstile: messaggi console NaN

Verifica effettuata il 4 ottobre 2026 su `https://itispot.dpdns.org/invia`,
con il widget production reale, senza inviare Spot o modificare configurazioni.

## Esito

**Origine: CLOUDFLARE. Warning esterno non bloccante nel flusso verificato.**

Il widget mostra “Operazione completata!”, popola il campo di risposta e invoca
il callback dell'applicazione. Non è stato trovato un errore di integrazione.
La verifica server del token non è stata ripetuta mediante un nuovo invio: resta
coperta dal collaudo production V1 già completato.

## Evidenza di origine

Gli eventi DevTools `Runtime.consoleAPICalled` del frame Turnstile contengono
questi tre argomenti:

- formato `%c%d`;
- stile `font-size:0;color:transparent`;
- numero `NaN`, rappresentato dal protocollo come `unserializableValue: NaN`.

Nel caricamento osservato sono presenti dodici emissioni con questi argomenti,
a livelli debug, error, info, log, trace e warning. **Tutti i frame di tutti gli
stack di queste emissioni appartengono a `challenges.cloudflare.com`**, sotto
`/cdn-cgi/challenge-platform/`. Nessun frame appartiene ai bundle ITISpot.
Il primo frame è la funzione offuscata `P5`; il sorgente del relativo script
è stato letto in sola lettura attraverso il debugger del frame Cloudflare.
Script ID, nomi offuscati e posizioni possono cambiare a ogni caricamento.

La provenienza è verificata; non attribuiamo uno scopo specifico a questi log
interni, il cui significato non è documentato dal provider. Il livello console
error non coincide, in questo caso osservato, con un callback di errore del
widget o con un fallimento dell'applicazione.

## Controlli dell'integrazione

- Site key reale presente nel Worker e corrispondente a quella resa al client;
  nessuna dummy key nel flusso production. I valori non sono riportati qui.
- Origin e hostname corrispondono al dominio production.
- Modalità production e binding dei secret presenti; nessuna variazione alle
  impostazioni remote o ai secret.
- `src/components/Turnstile.tsx` passa sitekey, action, size, theme e callback.
  Non passa parametri numerici, timeout o intervalli al widget. La larghezza
  del contenitore seleziona solo le stringhe compact o flexible.
- Action del form: `spot-submit`; action del login admin: `admin-login`.
- Il callback riceve il token come stringa; scadenza ed errore azzerano il token.
- Il backend conserva i controlli rigorosi success, action e hostname. Il timeout
  di 10 secondi del fetch server Siteverify è un intero e non viene passato al
  widget client.
- Nessun NaN o console.error/console.warn nel componente ITISpot. Le modifiche
  locali precedenti per i test Turnstile restano escluse da questa release.

I valori size e theme corrispondono alle opzioni della
[documentazione ufficiale del widget](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).
I controlli server seguono la
[validazione Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Comportamento operativo

Conservare questi messaggi come diagnostica esterna non bloccante finché il widget
completa la verifica e non esistono errori applicativi. Se il widget smette di
verificare, compare un errore nel form o Siteverify rifiuta token validi, aprire
una nuova indagine: questo documento non autorizza a ignorare altri errori.

Non sono stati applicati filtri console, patch allo script Cloudflare, bypass,
modifiche a key/hostname/action, nuovi timeout o disabilitazioni di controlli.
