"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  ImageIcon,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { Action, Spot, SpotPage } from "@/lib/types";
import { RetroWindow } from "./Window";
import { Turnstile } from "./Turnstile";
type Filter = "pending" | "approved" | "rejected" | "archived" | "all";
const labels = {
  pending: "In attesa",
  approved: "Approvati",
  rejected: "Rifiutati",
  archived: "Archivio",
  all: "Tutti",
};
const statusLabels = {
  pending: "In attesa",
  approved: "Approvato",
  rejected: "Rifiutato",
};
export function AdminDashboard({
  demo,
  siteKey = "",
  available = true,
}: {
  demo: boolean;
  siteKey?: string;
  available?: boolean;
}) {
  const [authenticated, setAuthenticated] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [spots, setSpots] = useState<Spot[]>([]),
    [filter, setFilter] = useState<Filter>("pending"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState<{
      spot: Spot;
      type: "delete" | "image";
    } | null>(null);
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [total, setTotal] = useState(0),
    [counts, setCounts] = useState<SpotPage["counts"]>({
      pending: 0,
      approved: 0,
      rejected: 0,
      archived: 0,
      all: 0,
    }),
    [fetching, setFetching] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const [token, setToken] = useState(""),
    [challenge, setChallenge] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    const current = ++generation.current;
    const params = new URLSearchParams({
      filter,
      search: query,
      page: String(page),
    });
    const r = await fetch("/api/admin/spots?" + params, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    if (current !== generation.current) return;
    if (r.status === 401) {
      setAuthenticated(false);
      return;
    }
    if (!r.ok)
      throw new Error(data.error || "Elenco non disponibile. Riprova.");
    setSpots(data.spots);
    setTotal(data.total);
    setCounts(data.counts);
    setAuthenticated(true);
    if (page > 1 && data.spots.length === 0) setPage(page - 1);
  }, [filter, query, page]);
  useEffect(() => {
    if (!available) {
      setLoading(false);
      return;
    }
    setFetching(true);
    setError("");
    load()
      .catch((e) =>
        setError(
          e instanceof TypeError
            ? "Connessione non disponibile. Riprova."
            : e.message,
        ),
      )
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [load, available]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !available) return;
    setBusy("login");
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/admin/session", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
          turnstile: token,
        }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(result.error || "Accesso non disponibile. Riprova.");
      await load();
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Connessione non disponibile. Riprova."
          : e instanceof Error
            ? e.message
            : "Accesso non riuscito.",
      );
    } finally {
      setBusy("");
      setToken("");
      setChallenge((v) => v + 1);
    }
  }
  async function logout() {
    if (busy) return;
    setBusy("logout");
    setError("");
    try {
      const r = await fetch("/api/admin/session", {
        method: "DELETE",
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error("Impossibile uscire. Riprova.");
      generation.current++;
      setAuthenticated(false);
      setSpots([]);
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function refresh() {
    setBusy("refresh");
    setError("");
    try {
      await load();
      setNotice("Elenco aggiornato.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function act(spot: Spot, action: Action) {
    setBusy(spot.id);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/admin/spots/${spot.id}`, {
        method: "PATCH",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) setAuthenticated(false);
      if (!r.ok)
        throw new Error(
          data.error || "Azione non disponibile. Aggiorna l’elenco e riprova.",
        );
      await load();
      setModal(null);
      setNotice(
        {
          approve: "Spot approvato. Nessuna pubblicazione effettuata.",
          reject: "Spot rifiutato.",
          archive: "Spot spostato in archivio.",
          restore: "Spot ripristinato nella sua categoria.",
          delete: "Spot e immagine eliminati.",
        }[action],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Azione non riuscita.");
      setModal(null);
    } finally {
      setBusy("");
    }
  }
  if (loading)
    return (
      <div className="admin-loading" role="status">
        <LoaderCircle className="spin" /> Apro la dashboard...
      </div>
    );
  if (!authenticated)
    return (
      <div className="login-layout">
        <img src="/itispot-chrome.png" width={460} height={154} alt="ITISpot" />
        <RetroWindow title="Area admin / Accesso riservato">
          <form className="login-form" onSubmit={login}>
            <LockKeyhole size={33} />
            <h1>Dietro le quinte.</h1>
            <p>
              Uno Spot alla volta.
              <br />
              Tieni questo spazio un bel posto.
            </p>
            {demo ? (
              <div className="notice">
                <strong>Modalità demo locale</strong>
                <p>
                  L’accesso è libero per provare la moderazione. Tutti gli Spot
                  di questa demo sono visibili a chi entra. Usa solo contenuti
                  di prova.
                </p>
              </div>
            ) : (
              <>
                <label htmlFor="email">Email admin</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </>
            )}
            {!available && (
              <p role="status" className="notice">
                Accesso admin in preparazione. Completa la configurazione del
                servizio prima di accedere.
              </p>
            )}
            {!demo && siteKey && available && (
              <Turnstile
                key={challenge}
                onToken={setToken}
                siteKey={siteKey}
                action="admin-login"
              />
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="primary-button"
              disabled={!available || !!busy || (!demo && !token)}
            >
              {busy ? <LoaderCircle className="spin" size={21} /> : null}
              {demo ? "ENTRA NELLA DEMO" : "ACCEDI"}
              <ArrowRight size={23} />
            </button>
            <Link href="/">← Torna al sito</Link>
          </form>
        </RetroWindow>
      </div>
    );
  const visible = spots;
  return (
    <>
      <div className="admin-heading">
        <div>
          <Link href="/" className="admin-brand">
            ITISpot<span> / control room</span>
          </Link>
          <h1>La voce passa da qui.</h1>
          <p>Leggi, prenditi un momento, modera.</p>
        </div>
        <button className="dark-button" disabled={!!busy} onClick={logout}>
          <LogOut size={16} /> Esci
        </button>
      </div>
      <div className="moderation-note">
        <ShieldCheck size={18} />
        <span>
          {demo ? "Demo locale · " : ""}Approvare uno Spot non lo pubblica. Ogni
          decisione resta nella dashboard.
        </span>
      </div>
      <RetroWindow
        title="Moderazione / Posta in arrivo"
        className="dashboard-window"
      >
        <div className="dashboard-toolbar">
          <div
            className="filter-tabs"
            role="group"
            aria-label="Filtra per stato"
          >
            {(Object.keys(labels) as Filter[]).map((key) => (
              <button
                key={key}
                disabled={!!busy}
                aria-pressed={filter === key}
                className={filter === key ? "active" : ""}
                onClick={() => {
                  setPage(1);
                  setFilter(key);
                }}
              >
                {labels[key]}
                <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="search-row">
            <label className="search-input">
              <Search size={17} />
              <input
                type="search"
                disabled={!!busy}
                aria-label="Cerca negli Spot"
                placeholder="Cerca un messaggio o un ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="retro-button"
              onClick={refresh}
              disabled={!!busy}
            >
              <RefreshCw
                size={15}
                className={busy === "refresh" ? "spin" : ""}
              />
              <span>Aggiorna</span>
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="form-error admin-alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="action-notice">
            <CheckCheck size={16} />
            {notice}
          </p>
        )}
        <div className="spot-list" aria-busy={fetching}>
          {visible.length === 0 ? (
            <div className="empty-state">
              <Inbox size={45} />
              <h2>
                {search
                  ? "Nessuna corrispondenza."
                  : filter === "pending"
                    ? "Tutto in ordine."
                    : "Ancora nessuno Spot qui."}
              </h2>
              <p>
                {search
                  ? "Prova a cercare un’altra parola."
                  : filter === "pending"
                    ? "I nuovi messaggi compariranno qui, pronti per essere letti."
                    : "Gli Spot in questa categoria compariranno qui."}
              </p>
              {!search && (
                <Link className="retro-button" href="/">
                  Apri il sito <ArrowRight size={16} />
                </Link>
              )}
            </div>
          ) : (
            visible.map((spot) => (
              <article className="spot-card" key={spot.id}>
                <div className="spot-meta">
                  <span className={`status status-${spot.status}`}>
                    {spot.status === "pending" ? (
                      <Clock3 size={13} />
                    ) : spot.status === "approved" ? (
                      <Check size={13} />
                    ) : (
                      <X size={13} />
                    )}{" "}
                    {statusLabels[spot.status]}
                  </span>
                  {spot.archived_at && (
                    <span className="archived-label">
                      <Archive size={12} /> Archiviato
                    </span>
                  )}
                  <time dateTime={spot.created_at}>
                    {new Date(spot.created_at).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <span className="spot-id">
                    #{spot.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <div className="spot-content">
                  <p>{spot.text}</p>
                  {spot.image_path && (
                    <button
                      className="image-preview"
                      onClick={() => setModal({ spot, type: "image" })}
                      aria-label={`Apri foto dello Spot ${spot.id.slice(0, 8)}`}
                    >
                      <img
                        src={`/api/admin/images/${spot.id}`}
                        alt="Immagine allegata allo Spot"
                      />
                      <span>
                        <ImageIcon size={13} /> Apri foto
                      </span>
                    </button>
                  )}
                </div>
                <div className="spot-actions">
                  <button
                    className="retro-button approve"
                    disabled={fetching || !!busy || spot.status === "approved"}
                    onClick={() => act(spot, "approve")}
                  >
                    <Check size={16} />
                    Approva
                  </button>
                  <button
                    className="retro-button"
                    disabled={fetching || !!busy || spot.status === "rejected"}
                    onClick={() => act(spot, "reject")}
                  >
                    <X size={16} />
                    Rifiuta
                  </button>
                  <button
                    className="text-button archive-action"
                    disabled={fetching || !!busy}
                    onClick={() =>
                      act(spot, spot.archived_at ? "restore" : "archive")
                    }
                  >
                    {spot.archived_at ? (
                      <ArchiveRestore size={15} />
                    ) : (
                      <Archive size={15} />
                    )}{" "}
                    {spot.archived_at ? "Ripristina" : "Archivia"}
                  </button>
                  <button
                    className="text-button delete-action"
                    disabled={!!busy}
                    onClick={() => setModal({ spot, type: "delete" })}
                  >
                    <Trash2 size={15} />
                    Elimina
                  </button>
                  {busy === spot.id && (
                    <LoaderCircle
                      size={16}
                      className="spin"
                      aria-label="Salvataggio in corso"
                    />
                  )}
                </div>
              </article>
            ))
          )}
        </div>
        <div className="dashboard-status">
          <span>
            {fetching
              ? "Caricamento…"
              : `${total} Spot · pagina ${page} di ${Math.max(1, Math.ceil(total / 24))}`}
          </span>
          <div className="pagination">
            <button
              className="retro-button"
              disabled={fetching || !!busy || page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Precedenti
            </button>
            <button
              className="retro-button"
              disabled={fetching || !!busy || page * 24 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Successivi
            </button>
          </div>
          <span>
            <span className="status-dot" /> Archivio privato
          </span>
        </div>
      </RetroWindow>
      <dialog
        ref={dialog}
        aria-labelledby="dialog-heading"
        className="admin-dialog"
        onCancel={() => setModal(null)}
      >
        <div className="dialog-title">
          <strong id="dialog-heading">
            {modal?.type === "delete"
              ? "Elimina questo Spot?"
              : "Foto allegata"}
          </strong>
          <button
            className="icon-button"
            aria-label="Chiudi"
            onClick={() => setModal(null)}
          >
            <X size={21} />
          </button>
        </div>
        {modal?.type === "delete" ? (
          <div className="dialog-body">
            <p>
              Il messaggio e la foto verranno eliminati definitivamente. Non
              potrai recuperarli.
            </p>
            <blockquote>{modal.spot.text.slice(0, 160)}</blockquote>
            <div className="dialog-actions">
              <button
                autoFocus
                className="retro-button"
                disabled={!!busy}
                onClick={() => setModal(null)}
              >
                Annulla
              </button>
              <button
                className="danger-button"
                disabled={fetching || !!busy}
                onClick={() => act(modal.spot, "delete")}
              >
                Elimina definitivamente
              </button>
            </div>
          </div>
        ) : (
          modal && (
            <img
              className="full-image"
              src={`/api/admin/images/${modal.spot.id}`}
              alt="Immagine allegata allo Spot, ingrandita"
            />
          )
        )}
      </dialog>
    </>
  );
}
