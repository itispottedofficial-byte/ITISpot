import "server-only";
import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

export const ACCOUNT_COOKIE = "itispot_user";
export function accountConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
}
export function accountClient(cookies: CookieMethodsServer) {
  if (!accountConfigured()) throw new Error("AccountConfigurationUnavailable");
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        name: ACCOUNT_COOKIE,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      },
      cookies,
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: init?.signal || AbortSignal.timeout(15000),
          }),
      },
    },
  );
}
