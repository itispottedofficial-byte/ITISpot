import Link from "next/link";
import { Suspense } from "react";
import { FeedPreview } from "@/components/FeedPreview";
import { FeedLoading } from "@/components/FeedLoading";
import { ArrowUpRight, BarChart3, Disc3, Trophy } from "lucide-react";
import { PortalShell, SectionTitle } from "@/components/PortalShell";
import { RetroWindow } from "@/components/Window";
import { SpotCard } from "@/components/SpotCard";
import { EmptyState } from "@/components/EmptyState";
import {
  presentedFeed,
  previewState,
  feedHref,
  type FeedParams,
  type PreviewState,
} from "@/lib/presented-feed";

export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<FeedParams>;
}) {
  const preview = previewState(await searchParams);
  return (
    <PortalShell active="home" preview={preview}>
      <SectionTitle
        title="NOVITÀ"
        description="Le voci, le idee e quello che succede qui."
      />
      <FeedPreview preview={preview} route="/" />
      <Suspense key={JSON.stringify(preview)} fallback={<FeedLoading home />}>
        <HomeHighlights preview={preview} />
      </Suspense>
      <section className="portal-continuation" aria-labelledby="next-title">
        <div className="continuation-checker" aria-hidden="true" />
        <div className="continuation-copy">
          <h2 id="next-title">Lo spazio cresce con le vostre voci.</h2>
          <p>Intanto, c’è qualcosa che vuoi dire?</p>
          <Link className="retro-button portal-send-button" href="/invia">
            Invia uno Spot <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="cd-sticker" aria-hidden="true">
          <Disc3 size={118} />
          <span>
            ITISpot
            <br />
            vol. 01
          </span>
        </div>
        <span className="continuation-star" aria-hidden="true">
          ✳
        </span>
      </section>
      <div className="portal-bottom-note">
        <span aria-hidden="true">✦</span> Nessun nome. Un po’ di rispetto. Il
        resto sono parole.
      </div>
    </PortalShell>
  );
}

async function HomeHighlights({ preview }: { preview?: PreviewState }) {
  const feed = await presentedFeed("", 1, preview);
  const latest = feed.spots[0];
  return (
    <div className="home-highlights">
      <RetroWindow
        title="01 / Ultimo Spot"
        className="portal-window latest-window"
      >
        {latest ? (
          <SpotCard spot={latest} compact />
        ) : (
          <EmptyState
            title={
              feed.available
                ? "La prima voce sarà qui."
                : "Un attimo, ci ricolleghiamo."
            }
            description={
              feed.available
                ? "Nessuno Spot approvato per ora. Ogni messaggio passa prima dal team."
                : "Le Novità non sono disponibili in questo momento. Riprova tra poco."
            }
          />
        )}
        <Link className="highlight-link" href={feedHref("/novita", preview)}>
          Tutti gli Spot <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </RetroWindow>
      <RetroWindow
        title="02 / Sondaggio attivo"
        className="portal-window poll-window"
      >
        <div className="feature-art poll-art" aria-hidden="true">
          <BarChart3 size={76} />
          <span>?</span>
          <i>✦</i>
        </div>
        <div className="feature-copy">
          <h2>La tua opinione conta.</h2>
          <p>
            Il primo sondaggio è ancora in preparazione. Quando sarà pronto, lo
            troverai qui.
          </p>
          <span className="feature-status">Nessun sondaggio attivo</span>
        </div>
      </RetroWindow>
      <RetroWindow
        title="03 / Classifiche & trending"
        className="portal-window trend-window"
      >
        <div className="feature-art trend-art" aria-hidden="true">
          <Trophy size={70} />
          <span>✧</span>
          <i>↗</i>
        </div>
        <div className="feature-copy">
          <h2>Il prossimo tormentone?</h2>
          <p>Questo spazio aspetta le classifiche e i contenuti del momento.</p>
          <span className="feature-status">In arrivo</span>
        </div>
      </RetroWindow>
    </div>
  );
}
