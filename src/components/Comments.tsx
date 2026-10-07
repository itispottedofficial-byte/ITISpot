"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { CommentPage } from "@/lib/comment-validation";

export function Comments({
  spotId,
  initialCount,
}: {
  spotId: string;
  initialCount?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false),
    request = useRef<AbortController | null>(null);
  const title = useId(),
    input = useId();
  const [open, setOpen] = useState(false),
    [count, setCount] = useState(initialCount),
    [data, setData] = useState<CommentPage | null>(null);
  const [page, setPage] = useState(1),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [authPrompt, setAuthPrompt] = useState(false),
    [report, setReport] = useState<string | null>(null),
    [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  async function load(next: number) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/comments?spot_id=${spotId}&page=${next}`,
        { cache: "no-store", signal: controller.signal },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Impossibile caricare i commenti.");
      if (!controller.signal.aborted) {
        setData(result);
        setCount(result.total);
        setPage(next);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setData(null);
        setError(e instanceof Error ? e.message : "Connessione interrotta.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => () => request.current?.abort(), []);
  function show() {
    setOpen(true);
    setAuthPrompt(false);
    setReport(null);
    setNotice("");
    dialog.current?.showModal();
    void load(1);
  }
  function close() {
    request.current?.abort();
    dialog.current?.close();
    setOpen(false);
  }
  async function mutate(url: string, method: string, body?: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      if (response.status === 401) {
        setAuthPrompt(true);
        return;
      }
      if (!response.ok)
        throw new Error(result.error || "Operazione non riuscita.");
      setContent("");
      setReport(null);
      setReason("");
      setDeleting(null);
      setNotice(
        result.message ||
          (method === "DELETE"
            ? "Commento eliminato."
            : "Commento pubblicato."),
      );
      await load(1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connessione interrotta. Riprova.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button className="comment-open" onClick={show}>
        <MessageSquare size={16} aria-hidden="true" /> Commenti
        {count !== undefined && (
          <span aria-label={`${count} commenti`}>{count}</span>
        )}
      </button>
      <dialog
        ref={dialog}
        className="comments-dialog"
        aria-labelledby={title}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
      >
        <div className="dialog-title">
          <strong id={title}>ITISpot / Commenti</strong>
          <button
            className="icon-button"
            aria-label="Chiudi commenti"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {open && (
          <div className="comments-body">
            <p className="comment-note">
              Lo Spot resta anonimo. Qui commenti con il tuo @username.
            </p>
            {authPrompt ? (
              <section className="comment-auth">
                <h2>Devi accedere per commentare</h2>
                <p>Serve un account anche per inviare una segnalazione.</p>
                <div className="comment-actions">
                  <Link className="retro-button" href="/login">
                    Accedi
                  </Link>
                  <Link className="retro-button" href="/registrati">
                    Registrati
                  </Link>
                  <button
                    className="retro-button"
                    onClick={() => setAuthPrompt(false)}
                  >
                    Annulla
                  </button>
                </div>
              </section>
            ) : (
              <>
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
                {!data && !loading && (
                  <button
                    className="retro-button"
                    onClick={() => void load(page)}
                  >
                    Riprova
                  </button>
                )}
                {data && (
                  <>
                    <div className="comment-list" aria-busy={loading}>
                      {!data.comments.length && (
                        <p className="comment-empty">
                          Nessun commento, per ora. Apri tu la conversazione.
                        </p>
                      )}
                      {data.comments.map((c) => (
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
                                {new Date(c.created_at).toLocaleString(
                                  "it-IT",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "Europe/Rome",
                                  },
                                )}
                              </time>
                            </div>
                          </header>
                          <p className="comment-content">{c.content}</p>
                          <div className="comment-actions">
                            <button
                              className="text-button"
                              disabled={busy || loading}
                              onClick={() => {
                                if (!data.authenticated) {
                                  setAuthPrompt(true);
                                  return;
                                }
                                setReport(c.id);
                                setReason("");
                              }}
                            >
                              Segnala
                            </button>
                            {c.own && (
                              <button
                                className="text-button delete-action"
                                disabled={busy || loading}
                                onClick={() => setDeleting(c.id)}
                              >
                                Elimina
                              </button>
                            )}
                          </div>
                          {deleting === c.id && (
                            <div className="comment-confirm">
                              <p>Eliminare definitivamente il tuo commento?</p>
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
                                  onClick={() =>
                                    void mutate(
                                      `/api/comments/${c.id}`,
                                      "DELETE",
                                    )
                                  }
                                >
                                  Conferma eliminazione
                                </button>
                              </div>
                            </div>
                          )}
                          {report === c.id && (
                            <form
                              className="comment-report"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void mutate(`/api/comments/${c.id}`, "POST", {
                                  reason,
                                });
                              }}
                            >
                              <label>
                                Motivo della segnalazione
                                <textarea
                                  required
                                  minLength={3}
                                  maxLength={300}
                                  value={reason}
                                  onChange={(e) => setReason(e.target.value)}
                                  disabled={busy}
                                />
                              </label>
                              <div className="comment-actions">
                                <button
                                  className="retro-button"
                                  disabled={busy}
                                >
                                  Invia segnalazione
                                </button>
                                <button
                                  type="button"
                                  className="retro-button"
                                  disabled={busy}
                                  onClick={() => setReport(null)}
                                >
                                  Annulla
                                </button>
                              </div>
                            </form>
                          )}
                        </article>
                      ))}
                    </div>
                    {data.total > 20 && (
                      <nav
                        className="comment-actions"
                        aria-label="Pagine dei commenti"
                      >
                        <button
                          className="retro-button"
                          disabled={loading || busy || page === 1}
                          onClick={() => void load(page - 1)}
                        >
                          Precedenti
                        </button>
                        <span>Pagina {page}</span>
                        <button
                          className="retro-button"
                          disabled={loading || busy || page * 20 >= data.total}
                          onClick={() => void load(page + 1)}
                        >
                          Successivi
                        </button>
                      </nav>
                    )}
                    {data.authenticated ? (
                      <form
                        className="comment-compose"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void mutate("/api/comments", "POST", {
                            spot_id: spotId,
                            content,
                          });
                        }}
                      >
                        <label htmlFor={input}>Il tuo commento</label>
                        <textarea
                          id={input}
                          placeholder="Aggiungi la tua voce. Rispetta chi legge."
                          maxLength={1000}
                          required
                          value={content}
                          disabled={busy}
                          onChange={(e) =>
                            setContent(
                              Array.from(e.target.value).slice(0, 500).join(""),
                            )
                          }
                        />
                        <div className="comment-actions">
                          <span>{Array.from(content).length}/500</span>
                          <button
                            className="retro-button"
                            disabled={busy || loading || !content.trim()}
                          >
                            {busy ? "Pubblicazione…" : "Pubblica"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        className="retro-button"
                        onClick={() => setAuthPrompt(true)}
                      >
                        Scrivi un commento
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
