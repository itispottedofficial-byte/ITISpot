import Link from "next/link";
import { AccountShell } from "@/components/AccountShell";
import { AccountForm } from "@/components/AccountForm";
export const metadata = {
  title: "Conferma email — ITISpot",
  referrer: "no-referrer" as const,
};
export const dynamic = "force-dynamic";
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = params.type;
  const valid =
    /^[a-zA-Z0-9_-]{20,256}$/.test(token) &&
    (type === "signup" || type === "recovery");
  return (
    <AccountShell
      title="CONFERMA EMAIL"
      description="Un ultimo clic per continuare."
    >
      <div className="account-window-content">
        <h2>
          {type === "recovery" ? "Recupera il tuo account." : "È la tua email?"}
        </h2>
        {valid ? (
          <>
            <p>
              Continua per{" "}
              {type === "recovery"
                ? "scegliere una nuova password"
                : "confermare l’indirizzo e aprire il profilo"}
              .
            </p>
            <AccountForm
              action="confirm"
              confirmation={{ token_hash: token, type }}
            />
          </>
        ) : (
          <>
            <p role="alert">Il link non è valido. Richiedi una nuova email.</p>
            <Link href="/password-dimenticata">Recupera accesso</Link>
          </>
        )}
      </div>
    </AccountShell>
  );
}
