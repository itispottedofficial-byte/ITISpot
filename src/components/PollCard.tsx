"use client";
import { useEffect, useId, useRef, useState } from "react";
import { pollPercentages, type Poll } from "@/lib/poll-validation";
let preparing: Promise<void> | null = null;
function prepare() {
  return (preparing ||= fetch("/api/polls/voter", { method: "POST" })
    .then(async (r) => {
      if (!r.ok)
        throw new Error(
          (await r.json()).error || "Impossibile preparare il voto.",
        );
    })
    .finally(() => {
      preparing = null;
    }));
}
export function PollCard({
  poll: initial,
  resultsOnly = false,
}: {
  poll: Poll;
  resultsOnly?: boolean;
}) {
  const [poll, setPoll] = useState(initial),
    [option, setOption] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    name = useId();
  const closed =
    poll.status !== "PUBLISHED" ||
    (!!poll.closes_at && Date.parse(poll.closes_at) <= Date.now());
  const results = resultsOnly || poll.voted || closed,
    percentages = pollPercentages(poll.options, poll.total);
  useEffect(() => {
    setPoll(initial);
  }, [initial]);
  useEffect(() => {
    if (results) return;
    let alive = true;
    prepare()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [results]);
  async function vote(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/polls/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poll_id: poll.id, option_id: option }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Voto non riuscito.");
      setPoll(data);
      setNotice("Voto registrato. Grazie!");
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
    <article className="poll-card">
      <div className="poll-meta">
        <span className="feature-status">
          {poll.status === "DRAFT" ? "Bozza" : closed ? "Chiuso" : "Aperto"}
        </span>
        {poll.closes_at && (
          <time dateTime={poll.closes_at}>
            Chiusura:{" "}
            {new Date(poll.closes_at).toLocaleString("it-IT", {
              timeZone: "Europe/Rome",
            })}
          </time>
        )}
      </div>
      <h2>{poll.question}</h2>
      {results ? (
        <div className="poll-results" aria-label="Risultati sondaggio">
          {poll.options.map((o, i) => (
            <div key={o.id} className="poll-result">
              <div>
                <span>{o.label}</span>
                <strong>
                  {percentages[i]}% · {o.votes}
                </strong>
              </div>
              <progress
                max={100}
                value={percentages[i]}
                aria-label={`${o.label}: ${percentages[i]}%`}
              />
            </div>
          ))}
          <p>
            {poll.total} {poll.total === 1 ? "voto" : "voti"} in totale
          </p>
        </div>
      ) : (
        <form onSubmit={vote}>
          <fieldset disabled={busy || !ready}>
            <legend className="sr-only">Scegli una risposta</legend>
            {poll.options.map((o) => (
              <label className="poll-option" key={o.id}>
                <input
                  type="radio"
                  name={name}
                  value={o.id}
                  checked={option === o.id}
                  onChange={() => setOption(o.id)}
                  required
                />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
          <button
            className="retro-button primary"
            disabled={!option || !ready || busy}
          >
            {busy ? "Invio…" : "VOTA"}
          </button>
          <p className="poll-hint">
            Senza account. Un voto per questo browser e sondaggio, finché
            conservi il cookie.
          </p>
        </form>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
