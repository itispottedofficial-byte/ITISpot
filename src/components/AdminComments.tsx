"use client";
import { useEffect, useRef, useState } from "react";
import type { ModeratedComment } from "@/lib/comment-validation";
import { RetroWindow } from "./Window";
export function AdminComments() {
  const [filter, setFilter] = useState("reported"),
    [page, setPage] = useState(1),
    [data, setData] = useState<{
      comments: ModeratedComment[];
      total: number;
    } | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null);
  const lock = useRef(false),
    request = useRef<AbortController | null>(null);
  async function load(filterValue: string, pageValue: number) {
    request.current?.abort();
    const ac = new AbortController();
    request.current = ac;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/admin/comments?filter=${filterValue}&page=${pageValue}`,
        { cache: "no-store", signal: ac.signal },
      );
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Caricamento non riuscito.");
      if (!ac.signal.aborted) setData(v);
    } catch (e) {
      if (!ac.signal.aborted) {
        setData(null);
        setError(e instanceof Error ? e.message : "Riprova.");
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void load(filter, page);
    return () => request.current?.abort();
  }, [filter, page]);
  async function act(id: string, action: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Operazione non riuscita.");
      setDeleting(null);
      setNotice(
        action === "hide"
          ? "Commento nascosto."
          : action === "restore"
            ? "Commento ripristinato."
            : "Commento eliminato.",
      );
      await load(filter, page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Riprova.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <RetroWindow
      title="Moderazione / Commenti e segnalazioni"
      className="dashboard-window admin-comments"
    >
      <div className="comments-body">
        <h2>Commenti / Segnalazioni</h2>
        <p>
          I commenti hanno un autore. Questo non identifica chi ha inviato lo
          Spot.
        </p>
        <div
          className="comment-actions"
          role="group"
          aria-label="Filtra commenti"
        >
          {[
            ["reported", "Segnalati"],
            ["hidden", "Nascosti"],
            ["all", "Tutti i commenti"],
          ].map(([value, label]) => (
            <button
              key={value}
              className="retro-button"
              aria-pressed={filter === value}
              disabled={busy}
              onClick={() => {
                setFilter(value);
                setPage(1);
                setDeleting(null);
              }}
            >
              {label}
            </button>
          ))}
          <button
            className="retro-button"
            disabled={busy || loading}
            onClick={() => void load(filter, page)}
          >
            Aggiorna commenti
          </button>
        </div>
        {error && (
          <p role="alert" className="account-feedback is-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="account-feedback">
            {notice}
          </p>
        )}
        {loading && <p role="status">Caricamento commenti…</p>}
        <div aria-busy={loading}>
          {data?.comments.map((c) => (
            <article className="comment-item" key={c.id}>
              <header>
                <span
                  className="account-avatar"
                  role="img"
                  aria-label={`Avatar di ${c.username}`}
                >
                  {c.username.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>@{c.username}</strong>
                  <time dateTime={c.created_at}>
                    {new Date(c.created_at).toLocaleString("it-IT", {
                      timeZone: "Europe/Rome",
                    })}
                  </time>
                </div>
                <span className="comment-status">
                  {c.status === "hidden" ? "Nascosto" : "Visibile"}
                </span>
              </header>
              <p className="comment-content">{c.content}</p>
              {c.report_count > 0 && (
                <details open>
                  <summary>{c.report_count} segnalazioni</summary>
                  <ul className="comment-reports">
                    {c.reports.map((r, i) => (
                      <li key={i}>
                        <p>{r.reason}</p>
                        <time dateTime={r.created_at}>
                          {new Date(r.created_at).toLocaleString("it-IT", {
                            timeZone: "Europe/Rome",
                          })}
                        </time>
                      </li>
                    ))}
                  </ul>
                  {c.report_count > 20 && (
                    <p>Mostrate le 20 segnalazioni più recenti.</p>
                  )}
                </details>
              )}
              <div className="comment-actions">
                <button
                  className="retro-button"
                  disabled={busy || loading}
                  onClick={() =>
                    void act(c.id, c.status === "hidden" ? "restore" : "hide")
                  }
                >
                  {c.status === "hidden"
                    ? "Ripristina commento"
                    : "Nascondi commento"}
                </button>
                <button
                  className="text-button delete-action"
                  disabled={busy || loading}
                  onClick={() => setDeleting(c.id)}
                >
                  Elimina commento
                </button>
              </div>
              {deleting === c.id && (
                <div className="comment-confirm">
                  <p>Eliminare definitivamente commento e segnalazioni?</p>
                  <div className="comment-actions">
                    <button
                      className="retro-button"
                      disabled={busy}
                      onClick={() => setDeleting(null)}
                    >
                      Annulla
                    </button>
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() => void act(c.id, "delete")}
                    >
                      Conferma eliminazione
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
        {data && !data.comments.length && !loading && (
          <p className="comment-empty">Nessun commento in questa sezione.</p>
        )}
        {data && (
          <nav
            className="comment-actions"
            aria-label="Pagine moderazione commenti"
          >
            <span>
              {data.total} commenti · pagina {page}
            </span>
            <button
              className="retro-button"
              disabled={busy || loading || page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Precedenti
            </button>
            <button
              className="retro-button"
              disabled={busy || loading || page * 20 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Successivi
            </button>
          </nav>
        )}
      </div>
    </RetroWindow>
  );
}
