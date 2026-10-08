"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Turnstile } from "./Turnstile";
import { RetroWindow } from "./Window";
import {
  REQUEST_CATEGORIES,
  requestSubmissionSchema,
} from "@/lib/request-validation";
export function RequestForm({
  demo,
  siteKey,
  available,
}: {
  demo: boolean;
  siteKey: string;
  available: boolean;
}) {
  const [category, setCategory] = useState("SUGGESTION"),
    [content, setContent] = useState(""),
    [consent, setConsent] = useState(false),
    [token, setToken] = useState(""),
    [challenge, setChallenge] = useState(0),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    success = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sent) success.current?.focus();
  }, [sent]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current || !available) return;
    setError("");
    const parsed = requestSubmissionSchema.safeParse({
      category,
      content,
      turnstile: token,
    });
    if (!parsed.success) {
      setError("Scegli una categoria e scrivi da 5 a 1000 caratteri validi.");
      return;
    }
    if (!consent) {
      setError(
        "Conferma che il contenuto rispetta le persone e la loro privacy.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(30000),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(
          result.error || "Invio non riuscito. Riprova tra poco.",
        );
      setSent(true);
      setContent("");
      setConsent(false);
    } catch (e) {
      setError(
        e instanceof TypeError ||
          (e instanceof Error && e.name === "TimeoutError")
          ? "Connessione interrotta. Il messaggio è ancora qui. L’invio potrebbe essere arrivato: attendi prima di riprovare."
          : e instanceof Error
            ? e.message
            : "Invio non riuscito. Riprova.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setToken("");
      setChallenge((v) => v + 1);
    }
  }
  return (
    <RetroWindow
      title="ITISpot / Richieste & Suggerimenti"
      className="request-window"
    >
      {sent ? (
        <div
          className="success-panel"
          ref={success}
          tabIndex={-1}
          role="status"
        >
          <div className="success-icon">
            <Check size={36} aria-hidden="true" />
          </div>
          <h2>Richiesta inviata!</h2>
          <p>Grazie! La leggeremo appena possibile.</p>
          <p className="success-note">
            Resta privata: può leggerla solo il team admin.
          </p>
          <button
            className="retro-button"
            onClick={() => {
              setSent(false);
              setError("");
            }}
          >
            Scrivi un’altra richiesta
          </button>
        </div>
      ) : (
        <form
          className="request-form"
          onSubmit={submit}
          aria-label="Invia una richiesta"
          aria-busy={busy}
        >
          {!available && (
            <p className="notice" role="status">
              Gli invii non sono ancora disponibili. Riprova più tardi.
            </p>
          )}
          <label htmlFor="request-category">Categoria</label>
          <select
            id="request-category"
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(REQUEST_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor="request-content">Messaggio</label>
          <textarea
            id="request-content"
            value={content}
            required
            disabled={busy}
            onChange={(e) =>
              setContent(Array.from(e.target.value).slice(0, 1000).join(""))
            }
            aria-describedby="request-counter request-hint"
            placeholder="La tua idea, un problema, qualcosa da migliorare..."
            rows={7}
          />
          <div className="request-field-meta">
            <span id="request-hint">
              Da 5 a 1000 caratteri. Evita dati personali.
            </span>
            <span id="request-counter">{Array.from(content).length}/1000</span>
          </div>
          <div className="consent-row">
            <input
              id="request-consent"
              type="checkbox"
              checked={consent}
              required
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <label htmlFor="request-consent">
              Confermo che il contenuto è rispettoso e non contiene dati
              personali inutili.
            </label>
          </div>
          {siteKey && (
            <Turnstile
              key={challenge}
              siteKey={siteKey}
              onToken={setToken}
              action="request-submit"
            />
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !available || (!!siteKey && !token)}
          >
            {busy ? "INVIO IN CORSO..." : "INVIA RICHIESTA"}
            <ArrowRight size={22} aria-hidden="true" />
          </button>
          <p className="form-footnote">
            <ShieldCheck size={16} aria-hidden="true" /> Solo per il team.
            Nessun account richiesto.
          </p>
          {demo && (
            <p className="demo-note">
              Demo locale: usa solo contenuti di prova.
            </p>
          )}
        </form>
      )}
    </RetroWindow>
  );
}
