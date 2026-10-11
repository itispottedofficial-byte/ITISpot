import { likeStats } from "@/lib/likes";
import { notFound } from "next/navigation";
import Link from "next/link";
import { publicSpot } from "@/lib/public-spots";
import { commentCounts } from "@/lib/comments";
import { PortalShell } from "@/components/PortalShell";
import { SpotCard } from "@/components/SpotCard";
import { RetroWindow } from "@/components/Window";
export const dynamic = "force-dynamic";
export default async function SpotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const spot = await publicSpot(id);
  if (!spot) notFound();
  const likes = await likeStats([id]);
  const counts = await commentCounts([id]);
  return (
    <PortalShell active="novita">
      <Link className="highlight-link" href="/spotted">
        Tutti gli Spotted
      </Link>
      <RetroWindow
        title="ITISpot / una voce anonima"
        className="portal-window spot-detail"
      >
        <SpotCard spot={spot} commentCount={counts?.[id]} likes={likes?.[id]} />
      </RetroWindow>
    </PortalShell>
  );
}
