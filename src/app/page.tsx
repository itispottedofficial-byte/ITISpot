import { redirect } from "next/navigation";
import { pollsPage } from "@/lib/polls";
import { PollCard } from "@/components/PollCard";
import { likeStats } from "@/lib/likes";
import { rankedFeed } from "@/lib/public-spots";
import Link from "next/link";
import { Suspense } from "react";
import { commentCounts } from "@/lib/comments";
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
  const params = await searchParams;
  const preview = previewState(params);
  // Old Home pagination bookmarks now open the dedicated archive.
  if (typeof params.page === "string") {
    const requested = Number(params.page);
    const page =
      Number.isSafeInteger(requested) && requested > 0
        ? Math.min(requested, 100000)
        : 1;
    redirect(feedHref("/spotted", preview, { page: String(page) }));
  }
  return (
    <PortalShell active="home" preview={preview}>
      <SectionTitle
        title="HOME"
        description="Le voci, le idee e quello che succede qui."
      />
      <FeedPreview preview={preview} route="/" />
      <Suspense key={JSON.stringify([preview])} fallback={<FeedLoading home />}>
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
  const [polls, feed, trendingFeed] = await Promise.all([
    preview
      ? Promise.resolve(null)
      : pollsPage(false, 1, true).catch(() => null),
    presentedFeed("", 1, preview),
    preview ? Promise.resolve(null) : rankedFeed("", 1, "trending"),
  ]);
  const poll = polls?.polls[0],
    latest = feed.spots[0],
    trending = trendingFeed?.spots[0];
  const ids = Array.from(
    new Set([latest?.id, trending?.id].filter((id): id is string => !!id)),
  );
  const [likes, counts] = await Promise.all([
    preview ? null : likeStats(ids),
    preview ? null : commentCounts(ids),
  ]);
  return (
    <>
      <div className="home-highlights">
        <RetroWindow
          title="01 / Ultimo Spot"
          className="portal-window latest-window"
        >
          {latest ? (
            <SpotCard
              spot={latest}
              compact
              commentCount={counts?.[latest.id]}
              likes={likes?.[latest.id]}
            />
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
          <Link className="highlight-link" href={feedHref("/spotted", preview)}>
            Tutti gli Spot <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </RetroWindow>
        <RetroWindow
          title="02 / Sondaggio attivo"
          className="portal-window poll-window"
        >
          {poll ? (
            <PollCard poll={poll} />
          ) : (
            <>
              <div className="feature-art poll-art" aria-hidden="true">
                <BarChart3 size={76} />
                <span>?</span>
                <i>✦</i>
              </div>
              <div className="feature-copy">
                <h2>La tua opinione conta.</h2>
                <p>
                  Il primo sondaggio è ancora in preparazione. Quando sarà
                  pronto, lo troverai qui.
                </p>
                <span className="feature-status">Nessun sondaggio attivo</span>
              </div>
            </>
          )}
          <Link className="highlight-link" href="/sondaggi">
            Tutti i sondaggi <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </RetroWindow>
        <RetroWindow
          title="03 / Trending della settimana"
          className="portal-window trend-window"
        >
          {trending ? (
            <SpotCard
              spot={trending}
              compact
              likes={likes?.[trending.id]}
              commentCount={counts?.[trending.id]}
            />
          ) : (
            <>
              <div className="feature-art trend-art" aria-hidden="true">
                <Trophy size={70} />
                <span>✧</span>
                <i>↗</i>
              </div>
              <div className="feature-copy">
                <h2>Il prossimo tormentone?</h2>
                <p>
                  Qui comparirà lo Spot con più mi piace negli ultimi 7 giorni.
                </p>
                <span className="feature-status">
                  Ancora nessun mi piace questa settimana
                </span>
              </div>
            </>
          )}
        </RetroWindow>
      </div>
      <Link
        className="retro-button archive-cta"
        href={feedHref("/spotted", preview)}
      >
        VEDI TUTTI GLI SPOTTED <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
    </>
  );
}
