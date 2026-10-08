import { NextRequest, NextResponse } from "next/server";
import {
  ACCOUNT_COOKIE,
  accountClient,
  accountConfigured,
} from "@/lib/account-client";

// Refresh only the public account shell. Spot submission and admin are independent.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const noCache = () => {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
  };
  noCache();
  if (
    !accountConfigured() ||
    !request.cookies
      .getAll()
      .some(
        (c) =>
          c.name === ACCOUNT_COOKIE || c.name.startsWith(ACCOUNT_COOKIE + "."),
      )
  )
    return response;
  const client = accountClient({
    getAll: () => request.cookies.getAll(),
    setAll: (values) => {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      );
      noCache();
    },
  });
  try {
    await client.auth.getUser();
  } catch {
    /* Pages handle service failure without exposing tokens. */
  }
  return response;
}
export const config = {
  matcher: [
    "/",
    "/novita",
    "/richieste",
    "/login",
    "/registrati",
    "/profilo",
    "/password-dimenticata",
    "/reset-password",
  ],
};
