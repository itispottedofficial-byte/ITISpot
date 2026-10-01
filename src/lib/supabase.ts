import "server-only";
import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./http";

export function checkAuthAvailability(error: { status?: number } | null) {
  if (error && (!error.status || error.status >= 500 || error.status === 429))
    throw new HttpError(
      503,
      "Accesso momentaneamente non disponibile. Riprova tra poco.",
    );
}
export function supabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal || AbortSignal.timeout(15_000),
            cache: "no-store",
          }),
      },
    },
  );
}
