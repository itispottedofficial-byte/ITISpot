import Link from "next/link";
import { z } from "zod";
import { Header, Footer } from "@/components/Shell";
import { RetroWindow } from "@/components/Window";
import { mode } from "@/lib/config";
export const dynamic = "force-dynamic";
export default function Privacy() {
  const demo = mode() === "demo";
  const operator = process.env.OPERATOR_NAME;
  const parsedEmail = z.email().safeParse(process.env.CONTACT_EMAIL);
  const email = parsedEmail.success ? parsedEmail.data : null;
  return (
    <div className="site-shell">
      <Header />
      <main id="main" className="privacy-main">
        <RetroWindow title="ITISpot / Privacy">
          <article className="privacy-content">
            <h1>
              La tua voce.
              <br />
              Con chiarezza.
            </h1>
            <p>
              ITISpot non chiede nome, email o registrazione a chi invia uno
              Spot. Questa pagina descrive il comportamento tecnico dell’MVP.
            </p>
            {demo && (
              <p className="notice">
                <strong>Stai usando una demo locale.</strong> Messaggi e
                immagini sono salvati sul computer che ospita il sito. Chi apre
                la demo admin può consultarli. Usa solo contenuti di prova.
              </p>
            )}
            <h2>Cosa viene salvato</h2>
            <p>
              Il testo del messaggio, l’immagine opzionale, la data, lo stato di
              moderazione e un identificativo casuale. Le immagini sono
              convertite in WebP: il nome originale e i metadati EXIF/GPS non
              vengono conservati. Volti e informazioni visibili nella foto non
              vengono oscurati automaticamente.
            </p>
            <h2>Chi può leggerlo</h2>
            <p>
              Il team di moderazione può leggere gli invii. Solo gli Spot
              approvati e non archiviati, con le eventuali immagini, sono
              visibili pubblicamente nelle Novità come “Anonimo”. Gli altri
              restano privati. Archiviare o rifiutare uno Spot ne interrompe
              l’accesso pubblico dal sito; eventuali copie già salvate da chi lo
              ha visto non possono essere ritirate automaticamente.
            </p>
            <h2>Anti-spam e anonimato</h2>
            <p>
              Il server limita i tentativi in finestre di 10 minuti. In modalità
              pubblica usa un codice HMAC dell’indirizzo IP senza salvarlo in
              chiaro. Hosting e Cloudflare possono trattare dati tecnici secondo
              le loro informative. L’anonimato assoluto non è garantito.
            </p>
            <h2>Account facoltativi</h2>
            <p>
              Per registrarti servono un’email privata, una password e uno
              username. Supabase Auth gestisce credenziali e verifica email; il
              profilo contiene username e date di creazione e aggiornamento.
              L’avatar è generato localmente. Gli Spot non contengono
              riferimenti al tuo account, anche quando sei connesso. Non esiste
              una sezione “i miei Spot”.
            </p>
            <p>
              Gli account usano cookie HttpOnly per mantenere la sessione, con
              durata fino a 30 giorni e rinnovo durante l’uso. Logout termina la
              sessione corrente. Le richieste di accesso sono limitate tramite
              il controllo anti-abuso già presente; non aggiungiamo analytics o
              tracciamento del profilo.
            </p>
            <h2>Cookie e servizi</h2>
            <p>
              Nessun cookie pubblicitario e nessuna analitica. La dashboard
              utilizza un cookie di sessione HttpOnly, con scadenza massima di
              un’ora. La modalità pubblica usa Supabase per dati e login e
              Cloudflare Turnstile per il controllo anti-spam.
            </p>
            <h2>Conservazione e richieste</h2>
            <p>
              Questo MVP conserva gli Spot finché un amministratore non li
              elimina. Archiviare li nasconde dalla coda, senza eliminarli.
              Prima di aprire il servizio al pubblico, il gestore deve definire
              tempi di conservazione, recapito per le richieste e informativa
              completa.
            </p>
            <h2>Gestore e contatti</h2>
            {operator && <p>Il servizio è gestito da {operator}.</p>}
            {email ? (
              <p>
                Per richieste sui dati o segnalazioni scrivi a{" "}
                <a href={`mailto:${email}`}>{email}</a>, indicando l’ID dello
                Spot se disponibile. Evita di inviare altri dati personali non
                necessari.
              </p>
            ) : (
              <p>
                Il recapito del gestore è ancora in preparazione. Il servizio
                non è pronto per raccogliere contenuti reali finché queste
                informazioni non sono completate.
              </p>
            )}
            <Link className="retro-button" href="/">
              ← Torna a ITISpot
            </Link>
          </article>
        </RetroWindow>
      </main>
      <Footer demo={demo} />
    </div>
  );
}
