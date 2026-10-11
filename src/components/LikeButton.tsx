"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
export function LikeButton({
  spotId,
  count = 0,
  liked = false,
}: {
  spotId: string;
  count?: number;
  liked?: boolean;
}) {
  const [state, setState] = useState({ count, liked }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  async function toggle() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spot_id: spotId, liked: !state.liked }),
      });
      const result = await r.json();
      if (r.status === 401) {
        dialog.current?.showModal();
        return;
      }
      if (!r.ok) throw new Error(result.error || "Mi piace non disponibile.");
      setState(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connessione interrotta.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="comment-open like-button"
        aria-label={state.liked ? "Rimuovi mi piace" : "Metti mi piace"}
        aria-pressed={state.liked}
        disabled={busy}
        onClick={toggle}
      >
        <Heart
          size={17}
          fill={state.liked ? "currentColor" : "none"}
          aria-hidden="true"
        />
        <span>{state.count}</span>
      </button>
      {error && <span role="alert">{error}</span>}
      <dialog ref={dialog} className="comments-dialog" aria-labelledby={title}>
        <div className="dialog-title">ITISpot / Mi piace</div>
        <div className="comments-body">
          <h2 id={title}>Accedi per mettere mi piace</h2>
          <div className="comment-actions">
            <Link href="/login" className="retro-button">
              Accedi
            </Link>
            <Link href="/registrati" className="retro-button">
              Registrati
            </Link>
            <button
              className="retro-button"
              onClick={() => dialog.current?.close()}
            >
              Annulla
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
