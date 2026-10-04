import { Heart, MessageSquare, Sparkles, UserRound } from "lucide-react";
import type { PublicSpot } from "@/lib/public-spots";

export function SpotCard({
  spot,
  compact = false,
  category,
}: {
  spot: PublicSpot & { imageAlt?: string };
  compact?: boolean;
  category?: string;
}) {
  const date = new Date(spot.created_at);
  return (
    <article className={`public-spot-card ${compact ? "is-compact" : ""}`}>
      <header className="public-spot-meta">
        <span className="anonymous-avatar">
          <UserRound size={20} aria-hidden="true" />
        </span>
        <div>
          <strong>Anonimo</strong>
          <time dateTime={spot.created_at}>
            {date.toLocaleDateString("it-IT", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Europe/Rome",
            })}
          </time>
        </div>
        <Sparkles size={19} aria-hidden="true" />
      </header>
      {category && <span className="public-spot-category">{category}</span>}
      <p className="public-spot-text">{spot.text}</p>
      {spot.imageUrl && (
        <img
          src={spot.imageUrl}
          alt={spot.imageAlt ?? "Foto allegata allo Spot di Anonimo"}
          className="public-spot-image"
          loading="lazy"
        />
      )}
      {!compact && (
        <footer
          className="public-spot-future"
          aria-label="Commenti e reazioni in arrivo"
        >
          <span>
            <MessageSquare size={16} aria-hidden="true" /> Commenti
          </span>
          <span>
            <Heart size={16} aria-hidden="true" /> Reazioni
          </span>
          <small>in arrivo</small>
        </footer>
      )}
    </article>
  );
}
