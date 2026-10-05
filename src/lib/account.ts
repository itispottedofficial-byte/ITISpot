import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  accountClient,
  accountConfigured,
  ACCOUNT_COOKIE,
} from "./account-client";
import { HttpError } from "./http";
import type { AccountProfile } from "./account-validation";

export async function serverAccountClient() {
  const jar = await cookies();
  return accountClient({
    getAll: () => jar.getAll(),
    setAll: (values) => {
      try {
        for (const { name, value, options } of values)
          jar.set(name, value, options);
      } catch {
        /* Read-only Server Component: proxy persists refreshed cookies. */
      }
    },
  });
}

export function authError(
  error: { status?: number; code?: string } | null,
  fallback = "Credenziali non valide.",
) {
  if (!error) return;
  if (error.status === 429)
    throw new HttpError(
      429,
      "Troppi tentativi. Aspetta qualche minuto e riprova.",
      60,
    );
  if (!error.status || error.status >= 500)
    throw new HttpError(
      503,
      "Account momentaneamente non disponibili. Riprova tra poco.",
    );
  if (error.code === "email_not_confirmed")
    throw new HttpError(401, "Conferma la tua email prima di accedere.");
  throw new HttpError(400, fallback);
}

export const currentAccount = cache(async () => {
  const jar = await cookies();
  if (
    !jar
      .getAll()
      .some(
        (c) =>
          c.name === ACCOUNT_COOKIE || c.name.startsWith(ACCOUNT_COOKIE + "."),
      )
  )
    return null;
  if (!accountConfigured())
    throw new HttpError(503, "Account momentaneamente non disponibili.");
  const client = await serverAccountClient();
  const { data, error } = await client.auth.getUser();
  if (error && (!error.status || error.status >= 500 || error.status === 429))
    authError(error);
  if (error || !data.user || !data.user.email_confirmed_at) return null;
  const profile = await client
    .from("profiles")
    .select("username,avatar_key,created_at")
    .eq("id", data.user.id)
    .single();
  if (profile.error || !profile.data)
    throw new HttpError(503, "Il profilo non è disponibile. Riprova tra poco.");
  return profile.data as AccountProfile;
});
