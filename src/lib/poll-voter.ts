import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { HttpError } from "./http";
export const POLL_COOKIE = "itispot_poll_voter";
const lifespan = 365 * 24 * 60 * 60;
const state = globalThis as typeof globalThis & { pollDevSecret?: string };
function key() {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ITISPOT_MODE === "supabase"
  )
    throw new HttpError(503, "Votazione momentaneamente non disponibile.");
  return (state.pollDevSecret ||= randomBytes(32).toString("hex"));
}
function mac(value: string) {
  return createHmac("sha256", key())
    .update("poll-cookie:" + value)
    .digest("hex");
}
export function voterCookieValue(raw: string | undefined): string | null {
  if (!raw || !/^\d{10}\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(raw)) return null;
  const [expires, nonce, signature] = raw.split("."),
    value = expires + "." + nonce;
  if (
    Number(expires) <= Date.now() / 1000 ||
    Number(expires) > Date.now() / 1000 + lifespan + 60
  )
    return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(mac(value)))
    ? value
    : null;
}
export function ensureVoter(req: NextRequest, response: NextResponse) {
  if (voterCookieValue(req.cookies.get(POLL_COOKIE)?.value)) return;
  const value = `${Math.floor(Date.now() / 1000) + lifespan}.${randomBytes(32).toString("hex")}`;
  response.cookies.set(POLL_COOKIE, value + "." + mac(value), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: lifespan,
  });
}
export function pollVoter(raw: string | undefined, poll: string) {
  const value = voterCookieValue(raw);
  return value
    ? createHmac("sha256", key())
        .update("poll-vote:" + poll + ":" + value)
        .digest("hex")
    : null;
}
