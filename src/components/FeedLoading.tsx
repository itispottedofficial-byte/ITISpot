import { RetroWindow } from "./Window";

export function FeedLoading({ home = false }: { home?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Caricamento Spot"
      className={home ? "home-highlights" : "public-feed"}
    >
      {Array.from({ length: home ? 3 : 2 }, (_, index) => (
        <RetroWindow
          key={index}
          title="ITISpot / caricamento..."
          className="portal-window"
        >
          <div className="feed-skeleton" aria-hidden="true">
            <span className="skeleton-avatar" />
            <span />
            <span />
            <span />
            <span />
          </div>
        </RetroWindow>
      ))}
      <span className="sr-only">Caricamento degli Spot in corso.</span>
    </div>
  );
}
