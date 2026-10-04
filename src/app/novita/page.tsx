import Link from "next/link";
import { Suspense } from "react";
import { FeedPreview } from "@/components/FeedPreview";
import { FeedLoading } from "@/components/FeedLoading";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
export const metadata = { title: "Novità — ITISpot" };
export default async function Novita({
  searchParams,
}: {
  searchParams: Promise<FeedParams>;
}) {
  const params = await searchParams;
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 500) : "";
  const value = typeof params.page === "string" ? Number(params.page) : 1;
  const page =
    Number.isSafeInteger(value) && value > 0 ? Math.min(value, 100000) : 1;
  const preview = previewState(params);
  return (
    <PortalShell active="novita" query={query} preview={preview}>
      <SectionTitle
        title="NOVITÀ"
        description="Le voci di ITISpot. Anonime, e prima di tutto moderate."
      />
      <FeedPreview preview={preview} route="/novita" />
      <div className="feed-toolbar">
        <span>
          {query ? `Risultati per “${query}”` : "Gli ultimi Spot approvati"}
        </span>
        {query ? (
          <Link href={feedHref("/novita", preview)}>Cancella ricerca</Link>
        ) : (
          <Link href="/invia">
            Invia il tuo Spot <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      <Suspense
        key={JSON.stringify([query, page, preview])}
        fallback={<FeedLoading />}
      >
        <NovitaFeed query={query} page={page} preview={preview} />
      </Suspense>
    </PortalShell>
  );
}

async function NovitaFeed({
  query,
  page,
  preview,
}: {
  query: string;
  page: number;
  preview?: PreviewState;
}) {
  const feed = await presentedFeed(query, page, preview);
  const pages = Math.max(1, Math.ceil(feed.total / 24));
  const href = (next: number) =>
    feedHref("/novita", preview, {
      ...(query ? { q: query } : {}),
      page: String(next),
    });
  return (
    <>
      {feed.spots.length ? (
        <div className="public-feed">
          {feed.spots.map((spot) => (
            <RetroWindow
              key={spot.id}
              title="ITISpot / una voce anonima"
              className="portal-window"
            >
              <SpotCard spot={spot} />
            </RetroWindow>
          ))}
        </div>
      ) : (
        <RetroWindow
          title="ITISpot / Novità"
          className="portal-window feed-empty-window"
        >
          <EmptyState
            title={
              !feed.available
                ? "Ci ricolleghiamo tra poco."
                : query || page > 1
                  ? "Nessuno Spot trovato."
                  : "La bacheca aspetta la prima voce."
            }
            description={
              !feed.available
                ? "Non riusciamo a caricare gli Spot. Riprova tra poco."
                : query || page > 1
                  ? "Prova un’altra ricerca o torna agli ultimi Spot."
                  : "Qui compariranno solo gli Spot approvati dal team. Nel frattempo, puoi inviare il tuo."
            }
            link={
              query || page > 1
                ? {
                    href: feedHref("/novita", preview),
                    label: "Torna alle Novità",
                  }
                : { href: "/invia", label: "Invia uno Spot" }
            }
          />
        </RetroWindow>
      )}
      {feed.available && (pages > 1 || page > 1) && (
        <nav className="feed-pagination" aria-label="Pagine delle Novità">
          {page > 1 ? (
            <Link className="retro-button" href={href(page - 1)}>
              <ArrowLeft size={16} aria-hidden="true" /> Precedenti
            </Link>
          ) : (
            <span />
          )}
          <span>
            Pagina {page} di {pages}
          </span>
          {page < pages ? (
            <Link className="retro-button" href={href(page + 1)}>
              Successivi <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
