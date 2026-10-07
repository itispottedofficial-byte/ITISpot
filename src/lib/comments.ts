import "server-only";
import { serverAccountClient } from "./account";
import { accountConfigured } from "./account-client";
import { HttpError } from "./http";
export async function commentsClient(requireUser = false) {
  if (!accountConfigured())
    throw new HttpError(
      503,
      "I commenti sono in preparazione. Riprova più tardi.",
    );
  const client = await serverAccountClient();
  const { data, error } = await client.auth.getUser();
  if (error && (!error.status || error.status >= 500 || error.status === 429))
    throw new HttpError(
      503,
      "Connessione agli account non disponibile. Riprova.",
    );
  const authenticated = !!data.user?.email_confirmed_at;
  if (requireUser && !authenticated)
    throw new HttpError(401, "Devi accedere per commentare");
  return { client, authenticated };
}
export function commentError(error: { code?: string } | null, retryAfter = 60) {
  if (!error) return;
  if (error.code === "P0429")
    throw new HttpError(
      429,
      "Troppi tentativi. Aspetta un momento e riprova.",
      retryAfter,
    );
  if (error.code === "42501")
    throw new HttpError(403, "Operazione non consentita.");
  if (error.code === "P0002")
    throw new HttpError(404, "Questo contenuto non è più disponibile.");
  if (["22023", "23514"].includes(error.code || ""))
    throw new HttpError(400, "Controlla il testo inserito.");
  throw new HttpError(
    503,
    "I commenti non sono disponibili. Riprova tra poco.",
  );
}
export async function commentCounts(
  ids: string[],
): Promise<Record<string, number> | null> {
  if (!ids.length || !accountConfigured()) return null;
  try {
    const client = await serverAccountClient();
    const { data, error } = await client.rpc("comment_counts", {
      p_spots: ids,
    });
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
