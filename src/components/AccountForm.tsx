"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, KeyRound, LogOut, Mail, UserRound } from "lucide-react";

export type AccountAction =
  "login" | "signup" | "forgot" | "reset" | "profile" | "confirm";
const labels = {
  login: "ACCEDI",
  signup: "CREA ACCOUNT",
  forgot: "INVIA LINK",
  reset: "SALVA PASSWORD",
  profile: "SALVA USERNAME",
  confirm: "CONFERMA E CONTINUA",
};
export async function accountRequest(action: string, body: unknown) {
  const response = await fetch(`/api/account/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Operazione non riuscita. Riprova.");
  return result as { message?: string; redirect?: string };
}
export function AccountForm({
  action,
  username = "",
  confirmation,
}: {
  action: AccountAction;
  username?: string;
  confirmation?: { token_hash: string; type: "signup" | "recovery" };
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    try {
      const result = await accountRequest(
        action,
        confirmation || Object.fromEntries(new FormData(form)),
      );
      if (result.redirect) {
        router.replace(result.redirect);
        router.refresh();
      } else {
        setMessage(result.message || "Fatto.");
        if (action === "profile") router.refresh();
        else form.reset();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connessione interrotta. Riprova.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit} aria-busy={busy}>
      {(action === "signup" || action === "profile") && (
        <label htmlFor="account-username">
          <span>
            <UserRound size={15} aria-hidden="true" /> Username
          </span>
          <input
            id="account-username"
            aria-label="Username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
            pattern="[A-Za-z0-9._]+"
            defaultValue={username}
            spellCheck={false}
            autoCapitalize="none"
            aria-describedby="username-help"
          />
          <small id="username-help">
            3–20 caratteri: lettere, numeri, punto e underscore. Nessun nome
            reale necessario.
          </small>
        </label>
      )}
      {["login", "signup", "forgot"].includes(action) && (
        <label htmlFor="account-email">
          <span>
            <Mail size={15} aria-hidden="true" /> Email
          </span>
          <input
            id="account-email"
            aria-label="Email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            maxLength={254}
          />
          {action === "signup" && (
            <small>Resta privata. Ti invieremo un link per confermarla.</small>
          )}
        </label>
      )}
      {["login", "signup", "reset"].includes(action) && (
        <label htmlFor="account-password">
          <span>
            <KeyRound size={15} aria-hidden="true" />{" "}
            {action === "reset" ? "Nuova password" : "Password"}
          </span>
          <input
            id="account-password"
            aria-label={action === "reset" ? "Nuova password" : "Password"}
            name="password"
            type="password"
            autoComplete={
              action === "login" ? "current-password" : "new-password"
            }
            required
            minLength={action === "login" ? 1 : 10}
            maxLength={128}
          />
          {action !== "login" && (
            <small>
              Almeno 10 caratteri. Scegli una password che non usi altrove.
            </small>
          )}
        </label>
      )}
      {["signup", "reset"].includes(action) && (
        <label htmlFor="account-confirm">
          <span>Conferma password</span>
          <input
            id="account-confirm"
            aria-label="Conferma password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
        </label>
      )}
      {error && (
        <p className="account-feedback is-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="account-feedback" role="status">
          {message}
        </p>
      )}
      <button
        className="retro-button account-submit"
        type="submit"
        disabled={busy}
      >
        {busy ? "UN ATTIMO…" : labels[action]}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      {action === "login" && (
        <div className="account-links">
          <Link href="/registrati">Registrati</Link>
          <Link href="/password-dimenticata">Password dimenticata?</Link>
        </div>
      )}
      {action === "login" && (
        <button
          type="button"
          className="account-resend"
          disabled={busy}
          onClick={async (event) => {
            const form = event.currentTarget.form;
            if (!form || submitting.current) return;
            submitting.current = true;
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const result = await accountRequest("resend", {
                email: new FormData(form).get("email"),
              });
              setMessage(result.message || "Richiesta inviata.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Riprova tra poco.");
            } finally {
              submitting.current = false;
              setBusy(false);
            }
          }}
        >
          Rinvia verifica email
        </button>
      )}
      {action === "signup" && (
        <p className="account-inline-note">
          Hai già un account? <Link href="/login">Accedi</Link>
        </p>
      )}
      {action === "forgot" && (
        <Link className="account-back" href="/login">
          ← Torna al login
        </Link>
      )}
    </form>
  );
}
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className={compact ? "account-logout is-compact" : "account-logout"}>
      <button
        className={
          compact ? "sidebar-item account-logout-button" : "retro-button"
        }
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await accountRequest("logout", {});
            router.replace("/login");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Riprova tra poco.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <LogOut size={16} aria-hidden="true" />
        <span>{busy ? "Uscita…" : "Logout"}</span>
      </button>
      {error && (
        <p className="account-feedback is-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
