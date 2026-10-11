import Link from "next/link";
import { PortalShell, SectionTitle } from "@/components/PortalShell";
import { RetroWindow } from "@/components/Window";
import { EmptyState } from "@/components/EmptyState";
import { PollCard } from "@/components/PollCard";
import { pollsPage } from "@/lib/polls";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sondaggi — ITISpot" };
export default async function Polls({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const value = Number(params.page || 1),
    page = Number.isSafeInteger(value) && value > 0 ? Math.min(value, 8334) : 1;
  let data;
  try {
    data = await pollsPage(false, page);
  } catch {
    data = null;
  }
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 12));
  return (
    <PortalShell active="polls">
      <SectionTitle
        title="SONDAGGI"
        description="La tua opinione conta. Vota anche senza account."
      />
      {data?.polls.length ? (
        <div className="poll-grid">
          {data.polls.map((p) => (
            <RetroWindow
              key={p.id}
              title="ITISpot / La parola a voi"
              className="portal-window"
            >
              <PollCard poll={p} />
            </RetroWindow>
          ))}
        </div>
      ) : (
        <RetroWindow title="ITISpot / Sondaggi" className="portal-window">
          <EmptyState
            title={
              data
                ? "Il prossimo sondaggio arriva qui."
                : "Ci ricolleghiamo tra poco."
            }
            description={
              data
                ? "Nessun sondaggio in questa pagina. Torna a trovarci."
                : "I sondaggi non sono disponibili. Riprova più tardi."
            }
          />
        </RetroWindow>
      )}
      {(pages > 1 || page > 1) && (
        <nav className="feed-pagination" aria-label="Pagine sondaggi">
          {page > 1 ? (
            <Link className="retro-button" href={`/sondaggi?page=${page - 1}`}>
              Precedenti
            </Link>
          ) : (
            <span />
          )}
          <span>
            Pagina {page} di {pages}
          </span>
          {page < pages && (
            <Link className="retro-button" href={`/sondaggi?page=${page + 1}`}>
              Successivi
            </Link>
          )}
        </nav>
      )}
    </PortalShell>
  );
}
