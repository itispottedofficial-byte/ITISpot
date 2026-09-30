import "server-only";
import { createClient } from "@supabase/supabase-js";
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
