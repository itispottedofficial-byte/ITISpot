import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { mode, assertConfigured, adminIds } from "./config";
import { isIP } from "node:net";
import { HttpError } from "./http";
import { localTransaction } from "./local-store";
import { supabase, checkAuthAvailability } from "./supabase";
const g = globalThis as typeof globalThis & { itispotSecret?: string };
function secret() {
  return (
    process.env.RATE_LIMIT_SECRET ||
    (g.itispotSecret ||= randomBytes(32).toString("hex"))
  );
}
export function fingerprint(req: NextRequest) {
  const header = process.env.TRUSTED_IP_HEADER;
  // No trust in arbitrary forwarded headers. Default is a shared bucket.
  const ip = header
    ? req.headers.get(header)?.split(",")[0].trim() || ""
    : "shared";
  if (mode() === "supabase" && (!header || !isIP(ip)))
    throw new HttpError(
      503,
      "Controllo anti-spam non disponibile. Riprova tra poco.",
    );
  return createHmac("sha256", secret())
    .update(`${new Date().toISOString().slice(0, 10)}:${ip}`)
    .digest("hex");
}
export async function rateLimit(
  req: NextRequest,
  scope = "submit",
  maximum = 5,
) {
  const key = `${scope}:${fingerprint(req)}`,
    windowSeconds = 600;
  let allowed: boolean;
  if (mode() === "demo")
    allowed = await localTransaction((d) => {
      const now = Date.now();
      for (const [k, v] of Object.entries(d.limits))
        if (v.reset <= now) delete d.limits[k];
      const entry = (d.limits[key] ||= {
        count: 0,
        reset: now + windowSeconds * 1000,
      });
      entry.count++;
      return entry.count <= maximum;
    });
  else {
    const { data, error } = await supabase().rpc("consume_rate_limit", {
      p_key: key,
      p_limit: maximum,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    allowed = data === true;
  }
  if (!allowed)
    throw new HttpError(
      429,
      "Hai fatto diversi tentativi. Aspetta 10 minuti e riprova.",
      windowSeconds,
    );
}
export async function verifyTurnstile(
  token: string,
  action: "spot-submit" | "admin-login" | "request-submit" = "spot-submit",
) {
  if (mode() === "demo" && !process.env.TURNSTILE_SECRET_KEY) return;
  if (!token || token.length > 2048)
    throw new HttpError(400, "Completa il controllo anti-spam.");
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      // Every verification must reach the provider; tokens are single-use.
      cache: "no-store",
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY!,
        response: token,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new HttpError(503, "Controllo anti-spam non disponibile. Riprova.");
  const result = await response.json();
  if (
    result.success !== true ||
    result.action !== action ||
    (process.env.TURNSTILE_HOSTNAME &&
      result.hostname !== process.env.TURNSTILE_HOSTNAME)
  )
    throw new HttpError(
      400,
      "Controllo anti-spam scaduto o non valido. Riprova.",
    );
}
export function demoSession() {
  const value = `demo:${Date.now() + 3600000}`;
  return `${value}.${createHmac("sha256", secret()).update(value).digest("hex")}`;
}
export async function requireAdmin(req: NextRequest) {
  assertConfigured();
  const token = req.cookies.get("itispot_session")?.value;
  if (!token) throw new HttpError(401, "Accedi per aprire la dashboard.");
  if (mode() === "demo") {
    const [value, signature] = token.split(".");
    const expected = createHmac("sha256", secret())
      .update(value || "")
      .digest("hex");
    if (
      !/^demo:\d+\.[a-f0-9]{64}$/.test(token) ||
      !signature ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
      Number(value.split(":")[1]) <= Date.now()
    )
      throw new HttpError(401, "Sessione scaduta. Accedi di nuovo.");
  } else {
    const { data, error } = await supabase().auth.getUser(token);
    checkAuthAvailability(error);
    const admins = adminIds();
    if (error || !data.user || !admins.includes(data.user.id))
      throw new HttpError(401, "Accesso riservato agli amministratori.");
  }
}
export function setSession(
  response: NextResponse,
  token: string,
  maxAge = 3600,
) {
  response.cookies.set("itispot_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}
