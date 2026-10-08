"use client";
import { useEffect, useId, useRef, useState } from "react";
import { RetroWindow } from "./Window";
import {
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  type PrivateRequest,
  type RequestPage,
} from "@/lib/request-validation";
type Filter = PrivateRequest["status"] | "ALL";
function RequestItem({
  row,
  onAction,
  busy,
}: {
  row: PrivateRequest;
  onAction: (
    id: string,
    action: "save" | "delete",
    patch?: { status: PrivateRequest["status"]; admin_note: string },
  ) => Promise<void>;
  busy: boolean;
}) {
  const fieldId = useId();
  const [status, setStatus] = useState(row.status),
    [note, setNote] = useState(row.admin_note || ""),
    [deleting, setDeleting] = useState(false);
  return (
    <details className="request-item">
      <summary>
        <span className="request-category">
          {REQUEST_CATEGORIES[row.category]}
        </span>
        <span className="request-status">{REQUEST_STATUSES[row.status]}</span>
        <time dateTime={row.created_at}>
          {new Date(row.created_at).toLocaleString("it-IT")}
        </time>
        <span className="request-snippet">{row.content}</span>
        <span className="request-open-label">Apri richiesta</span>
      </summary>
      <div className="request-detail">
        <p className="request-content">{row.content}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onAction(row.id, "save", { status, admin_note: note });
          }}
        >
          <div className="request-field">
            <label htmlFor={fieldId + "-status"}>Stato</label>
            <select
              id={fieldId + "-status"}
              value={status}
              disabled={busy}
              onChange={(e) =>
                setStatus(e.target.value as PrivateRequest["status"])
              }
            >
              {Object.entries(REQUEST_STATUSES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="request-field">
            <label htmlFor={fieldId + "-note"}>Nota interna</label>
            <textarea
              id={fieldId + "-note"}
              aria-describedby={fieldId + "-hint"}
              value={note}
              disabled={busy}
              rows={4}
              onChange={(e) =>
                setNote(Array.from(e.target.value).slice(0, 2000).join(""))
              }
            />
            <small id={fieldId + "-hint"}>
              {Array.from(note).length}/2000 · Visibile solo agli amministratori
            </small>
          </div>
          <div className="request-actions">
            <button className="retro-button" disabled={busy} type="submit">
              {busy ? "Attendi..." : "Salva richiesta"}
            </button>
            <button
              className="retro-button"
              type="button"
              disabled={busy}
              onClick={() => setDeleting((v) => !v)}
            >
              Elimina richiesta
            </button>
          </div>
        </form>
        {deleting && (
          <div
            className="request-delete"
            role="group"
            aria-label="Conferma eliminazione richiesta"
          >
            <p>Eliminare definitivamente questa richiesta e la nota interna?</p>
            <div className="request-actions">
              <button
                className="retro-button"
                disabled={busy}
                onClick={() => void onAction(row.id, "delete")}
              >
                Conferma eliminazione richiesta
              </button>
              <button
                className="retro-button"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
export function AdminRequests() {
  const [filter, setFilter] = useState<Filter>("ALL"),
    [page, setPage] = useState(1),
    [data, setData] = useState<RequestPage | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    void fetch(`/api/admin/requests?filter=${filter}&page=${page}`, {
      cache: "no-store",
      signal: ac.signal,
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error || "Caricamento non riuscito.");
        if (!ac.signal.aborted) {
          if (page > 1 && !v.requests.length) setPage((p) => p - 1);
          else setData(v);
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted)
          setError(e instanceof Error ? e.message : "Riprova.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [filter, page, refresh]);
  async function act(
    id: string,
    action: "save" | "delete",
    patch?: { status: PrivateRequest["status"]; admin_note: string },
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/admin/requests/${id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(patch ? { body: JSON.stringify(patch) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      const v = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(v.error || "Operazione non riuscita. Riprova.");
      setNotice(
        action === "delete" ? "Richiesta eliminata." : "Richiesta aggiornata.",
      );
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "Connessione interrotta. Aggiorna l’elenco prima di riprovare.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <RetroWindow
      title="Moderazione / Richieste"
      className="dashboard-window admin-requests"
    >
      <div className="requests-admin-body">
        <h2>Richieste & Suggerimenti</h2>
        <p>Posta privata per il team, senza collegamento agli account.</p>
        <div
          className="request-filters"
          role="group"
          aria-label="Filtra richieste"
        >
          {Object.entries({ ALL: "Tutte", ...REQUEST_STATUSES }).map(
            ([key, label]) => (
              <button
                className="retro-button"
                key={key}
                aria-pressed={filter === key}
                disabled={busy || loading}
                onClick={() => {
                  setFilter(key as Filter);
                  setPage(1);
                  setNotice("");
                }}
              >
                {label}
              </button>
            ),
          )}
          <button
            className="retro-button"
            disabled={busy || loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Aggiorna richieste
          </button>
        </div>
        {notice && (
          <p role="status" className="account-feedback">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Caricamento richieste...</p>
        ) : data?.requests.length ? (
          <div className="request-list">
            {data.requests.map((row) => (
              <RequestItem
                key={row.id + row.updated_at}
                row={row}
                busy={busy}
                onAction={act}
              />
            ))}
          </div>
        ) : (
          data && <p>Nessuna richiesta in questa sezione.</p>
        )}
        {data && (
          <nav className="request-pagination" aria-label="Pagine richieste">
            <span>
              {data.total} richieste · pagina {page}
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
