import Link from "next/link";
import { MessageSquare, Star } from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { RequestForm } from "@/components/RequestForm";
import { configurationIssues, mode, turnstileSiteKey } from "@/lib/config";
export const dynamic = "force-dynamic";
export const metadata = { title: "Richieste & Suggerimenti — ITISpot" };
export default function Richieste() {
  return (
    <PortalShell active="requests">
      <div className="requests-layout">
        <section className="account-intro">
          <span className="account-eyebrow">ITISpot / posta per il team</span>
          <h1>
            Richieste &<br />
            Suggerimenti
            <Star aria-hidden="true" />
          </h1>
          <p>
            Hai un’idea per ITISpot? Vuoi suggerire una funzione o segnalarci
            qualcosa? Scrivilo qui.
          </p>
          <div className="request-sticker" aria-hidden="true">
            <MessageSquare size={54} />
            <span>
              your ideas.
              <br />
              our inbox.
            </span>
            <i>✦</i>
          </div>
          <div className="account-optional">
            <MessageSquare aria-hidden="true" />
            <div>
              <strong>Un messaggio privato, senza account.</strong>
              <p>
                Le richieste non vengono pubblicate e non sono collegate
                automaticamente al profilo, anche quando sei connesso.
              </p>
              <Link href="/privacy">Come trattiamo i dati →</Link>
            </div>
          </div>
        </section>
        <RequestForm
          demo={mode() === "demo"}
          siteKey={turnstileSiteKey()}
          available={configurationIssues().length === 0}
        />
      </div>
    </PortalShell>
  );
}
