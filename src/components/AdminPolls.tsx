"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RetroWindow } from "./Window";
import { PollCard } from "./PollCard";
import type { Poll, PollPage } from "@/lib/poll-validation";
export function AdminPolls() {
  const [data, setData] = useState<PollPage>({ polls: [], total: 0 }),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [id, setId] = useState<string>(),
    [question, setQuestion] = useState(""),
    [options, setOptions] = useState(["", ""]),
    [closes, setCloses] = useState("");
  const lock = useRef(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/polls?page=${page}`, {
      cache: "no-store",
    });
    const value = await r.json();
    if (!r.ok)
      throw new Error(value.error || "Impossibile caricare i sondaggi.");
    setData(value);
  }, [page]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  function clear() {
    setId(undefined);
    setQuestion("");
    setOptions(["", ""]);
    setCloses("");
  }
  async function mutate(body: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error || "Operazione non riuscita.");
      clear();
      await load();
      setNotice("Sondaggio aggiornato.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connessione interrotta.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function edit(p: Poll) {
    setId(p.id);
    setQuestion(p.question);
    setOptions(p.options.map((o) => o.label));
    setCloses(
      p.closes_at
        ? new Date(
            Date.parse(p.closes_at) -
              new Date(p.closes_at).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    );
  }
  return (
    <section className="admin-polls" aria-label="Gestione sondaggi">
      <RetroWindow title="SONDAGGI / Gestione admin">
        <div className="admin-polls-body">
          <h2>Sondaggi</h2>
          <p>
            Pubblica una domanda per tutti. Le opzioni si bloccano alla
            pubblicazione. Un solo sondaggio in evidenza sulla Home.
          </p>
          <form
            className="poll-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate({
                action: "save",
                ...(id ? { id } : {}),
                question,
                options,
                closes_at: closes ? new Date(closes).toISOString() : null,
              });
            }}
          >
            <h3>{id ? "Modifica bozza" : "Nuovo sondaggio"}</h3>
            <label htmlFor="poll-question">Domanda</label>
            <textarea
              id="poll-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              minLength={5}
              maxLength={300}
              required
              disabled={busy}
            />
            {options.map((o, i) => (
              <label key={i}>
                Opzione {i + 1}
                <input
                  value={o}
                  maxLength={150}
                  required
                  disabled={busy}
                  onChange={(e) =>
                    setOptions((v) =>
                      v.map((x, n) => (n === i ? e.target.value : x)),
                    )
                  }
                />
              </label>
            ))}
            <div className="comment-actions">
              <button
                className="retro-button"
                type="button"
                disabled={busy || options.length >= 6}
                onClick={() => setOptions((v) => [...v, ""])}
              >
                Aggiungi opzione
              </button>
              <button
                className="retro-button"
                type="button"
                disabled={busy || options.length <= 2}
                onClick={() => setOptions((v) => v.slice(0, -1))}
              >
                Rimuovi ultima opzione
              </button>
            </div>
            <label>
              Chiusura facoltativa (ora locale)
              <input
                type="datetime-local"
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
                disabled={busy}
              />
            </label>
            <div className="comment-actions">
              <button className="retro-button primary" disabled={busy}>
                Salva bozza
              </button>
              {id && (
                <button type="button" className="retro-button" onClick={clear}>
                  Annulla modifica
                </button>
              )}
            </div>
          </form>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {!data.polls.length && <p>Nessun sondaggio in questa pagina.</p>}
          <div className="poll-grid">
            {data.polls.map((p) => (
              <div key={p.id} className="admin-poll-item">
                <PollCard poll={p} resultsOnly />
                <div className="comment-actions">
                  {p.status === "DRAFT" ? (
                    <>
                      <button
                        className="retro-button"
                        disabled={busy}
                        onClick={() => edit(p)}
                      >
                        Modifica bozza
                      </button>
                      <button
                        className="retro-button"
                        disabled={busy}
                        onClick={() => mutate({ id: p.id, action: "publish" })}
                      >
                        Pubblica sondaggio
                      </button>
                      <button
                        className="retro-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm("Eliminare definitivamente questa bozza?")
                          )
                            void mutate({ id: p.id, action: "delete" });
                        }}
                      >
                        Elimina bozza
                      </button>
                    </>
                  ) : p.status === "PUBLISHED" ? (
                    <>
                      <button
                        className="retro-button"
                        disabled={busy}
                        onClick={() => mutate({ id: p.id, action: "close" })}
                      >
                        Chiudi sondaggio
                      </button>
                      <button
                        className="retro-button"
                        disabled={busy || p.featured}
                        onClick={() => mutate({ id: p.id, action: "feature" })}
                      >
                        {p.featured ? "In evidenza in Home" : "Metti in Home"}
                      </button>
                    </>
                  ) : (
                    <span>Sondaggio chiuso</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <nav className="feed-pagination" aria-label="Pagine admin sondaggi">
            <button
              className="retro-button"
              disabled={busy || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Precedenti
            </button>
            <span>Pagina {page}</span>
            <button
              className="retro-button"
              disabled={busy || page * 12 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Successivi
            </button>
          </nav>
        </div>
      </RetroWindow>
    </section>
  );
}
