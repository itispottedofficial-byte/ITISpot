"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ImagePlus,
  X,
  ShieldCheck,
  Check,
  LoaderCircle,
  Send,
} from "lucide-react";
import { RetroWindow } from "./Window";
import { Turnstile } from "./Turnstile";
import { fileError } from "@/lib/validation";
export function SpotForm({
  demo,
  siteKey = "",
  available = true,
}: {
  demo: boolean;
  siteKey?: string;
  available?: boolean;
}) {
  const [text, setText] = useState(""),
    [consent, setConsent] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState(""),
    [dragging, setDragging] = useState(false),
    [token, setToken] = useState(""),
    [challenge, setChallenge] = useState(0);
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null),
    success = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!file || /heic|heif/i.test(file.type + file.name)) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (receipt) success.current?.focus();
  }, [receipt]);
  function choose(selected: File | undefined) {
    if (!selected) return;
    const issue = fileError(selected);
    if (issue) {
      setFile(null);
      setError(issue);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFile(selected);
    setError("");
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current || !available) return;
    setError("");
    if (!text.trim()) {
      setError("Scrivi qualcosa prima di inviare.");
      return;
    }
    if (!consent) {
      setError("Leggi e accetta le regole.");
      return;
    }
    const data = new FormData(e.currentTarget);
    data.set("text", text);
    data.set("consent", String(consent));
    data.set("turnstile", token);
    data.delete("image");
    if (file) data.set("image", file);
    submitting.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/spots", {
        method: "POST",
        body: data,
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error || "Il server non risponde. Riprova tra poco.",
        );
      setReceipt(result.id);
      setText("");
      setFile(null);
      setConsent(false);
    } catch (e) {
      setError(
        e instanceof TypeError ||
          (e instanceof Error && e.name === "TimeoutError")
          ? "Connessione interrotta. Il tuo testo è ancora qui: riprova."
          : e instanceof Error
            ? e.message
            : "Invio non riuscito. Riprova.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
      setToken("");
      setChallenge((v) => v + 1);
    }
  }
  return (
    <RetroWindow
      title={receipt ? "Messaggio ricevuto!" : "Invia il tuo Spot"}
      className="spot-window"
    >
      {receipt ? (
        <div ref={success} tabIndex={-1} className="success-panel">
          <div className="success-icon">
            <Check size={40} />
          </div>
          <span className="receipt">
            SPOT #{receipt.slice(0, 8).toUpperCase()}
          </span>
          <h2>Detto. Fatto. Anonimo.</h2>
          <p>
            Il tuo Spot è arrivato.
            <br />
            Ora passa al team di moderazione.
          </p>
          <div className="success-note">
            <ShieldCheck size={20} />
            <span>
              È in attesa di revisione.
              <br />
              Non è stato pubblicato.
            </span>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setReceipt("");
              setError("");
            }}
          >
            SCRIVI UN ALTRO SPOT <ArrowRight size={22} />
          </button>
          <a href="#info">Cosa succede adesso?</a>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="spot-form"
          aria-label="Invia uno Spot"
          aria-busy={busy}
        >
          {!available && (
            <p className="notice" role="status">
              ITISpot è in preparazione. Gli invii saranno disponibili a breve.
            </p>
          )}
          <div className="field-heading">
            <label htmlFor="message">Il tuo messaggio</label>
            <span>Fatti sentire.</span>
          </div>
          <div className="textarea-wrap">
            <textarea
              id="message"
              name="text"
              placeholder="Quello che non dici ad alta voce..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              required
              disabled={busy}
              aria-describedby="counter"
            />
            <span
              id="counter"
              aria-live="off"
              className={text.length > 470 ? "counter near-limit" : "counter"}
            >
              {text.length}/500
            </span>
          </div>
          <div
            className={`upload-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) choose(e.dataTransfer.files[0]);
            }}
          >
            {file ? (
              <>
                <div className="file-thumb">
                  {preview ? (
                    <img src={preview} alt="Anteprima della foto selezionata" />
                  ) : (
                    <ImagePlus size={28} />
                  )}
                </div>
                <div className="upload-copy">
                  <strong>{file.name}</strong>
                  <span>
                    {(file.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                    {preview
                      ? "Foto pronta"
                      : "Foto pronta · anteprima non disponibile"}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label="Rimuovi foto"
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                >
                  <X size={20} />
                </button>
              </>
            ) : (
              <>
                <ImagePlus className="upload-icon" size={34} />
                <div className="upload-copy">
                  <strong>Aggiungi una foto</strong>
                  <span>JPG, PNG, HEIC · max 10 MB</span>
                </div>
                <button
                  type="button"
                  className="retro-button choose-file"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                >
                  Scegli file
                </button>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              className="sr-only"
              aria-label="Carica una foto"
              tabIndex={-1}
              onChange={(e) => choose(e.target.files?.[0])}
              disabled={busy}
            />
          </div>
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="website">Lascia vuoto</label>
            <input
              id="website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          <div className="consent-row">
            <input
              id="consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy}
              required
            />
            <label htmlFor="consent">
              Ho letto le <a href="#regole">regole</a>. Rispetto le persone.
            </label>
          </div>
          {siteKey && (
            <Turnstile key={challenge} onToken={setToken} siteKey={siteKey} />
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={!available || busy || (!!siteKey && !token)}
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={22} /> INVIO IN CORSO...
              </>
            ) : (
              <>
                INVIA LO SPOT <ArrowRight size={26} />
              </>
            )}
          </button>
          <p className="form-footnote">
            <ShieldCheck size={13} /> Nessun nome richiesto. Ogni Spot viene
            moderato.
          </p>
          {demo && (
            <p className="demo-note">
              <Send size={11} /> Demo locale: gli Spot restano su questo
              computer.
            </p>
          )}
        </form>
      )}
    </RetroWindow>
  );
}
