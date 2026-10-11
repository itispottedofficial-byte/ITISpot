import { LikeButton } from "./LikeButton";
import Link from "next/link";
import { Sparkles, UserRound } from "lucide-react";
import { Comments } from "./Comments";
import type { PublicSpot } from "@/lib/public-spots";

export function SpotCard({
  spot,
  compact = false,
  category,
  commentCount,
  likes,
}: {
  spot: PublicSpot & { imageAlt?: string };
  compact?: boolean;
  category?: string;
  commentCount?: number;
  likes?: { count: number; liked: boolean };
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
      {compact && (
        <Link className="highlight-link" href={`/spotted/${spot.id}`}>
          Apri lo Spot {likes && `· ${likes.count} mi piace`}{" "}
          {commentCount !== undefined && `· ${commentCount} commenti`}
        </Link>
      )}
      {!compact && (
        <footer className="public-spot-future" aria-label="Commenti e reazioni">
          <Comments spotId={spot.id} initialCount={commentCount} />
          <LikeButton
            spotId={spot.id}
            count={likes?.count}
            liked={likes?.liked}
          />
        </footer>
      )}
    </article>
  );
}
