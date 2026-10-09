import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/requests/route";
import { GET } from "@/app/api/admin/requests/route";
import { PATCH, DELETE } from "@/app/api/admin/requests/[id]/route";
const id = "00000000-0000-4000-8000-000000000009",
  admin = "00000000-0000-4000-8000-000000000001",
  origin = "https://itispot.example";
const env = {
  NODE_ENV: "production",
  ITISPOT_MODE: "supabase",
  TURNSTILE_MODE: "production",
  ITISPOT_RUNTIME: "cloudflare",
  APP_ORIGIN: origin,
  SUPABASE_URL: "https://db.example",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
  ADMIN_USER_IDS: admin,
  RATE_LIMIT_SECRET: "fixture-private-secret-at-least-32-characters",
  TRUSTED_IP_HEADER: "cf-connecting-ip",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "fixture-site-key",
  TURNSTILE_SECRET_KEY: "fixture-turnstile-secret",
  TURNSTILE_HOSTNAME: "itispot.example",
};
const req = (method: string, url: string, body?: unknown, cookie = "") =>
  new NextRequest(origin + url, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.88",
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
let calls: { url: URL; method: string; body: Record<string, unknown> | null }[];
let usedTokens: Set<string>;
let challengeTimestamp: string;
let fail = false,
  normal = false,
  limited = false;
beforeEach(() => {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  calls = [];
  usedTokens = new Set();
  challengeTimestamp = new Date().toISOString();
  fail = false;
  normal = false;
  limited = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method || "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });
      if (url.hostname === "challenges.cloudflare.com")
        return Response.json({
          success: true,
          challenge_ts: challengeTimestamp,
          hostname: "itispot.example",
          action: "request-submit",
        });
      if (url.pathname === "/auth/v1/user")
        return Response.json({ id: normal ? id : admin });
      if (url.pathname === "/rest/v1/rpc/consume_rate_limit") {
        const key = String(body?.p_key || "");
        if (key.startsWith("request-turnstile:")) {
          const fresh = !usedTokens.has(key);
          usedTokens.add(key);
          return Response.json(fresh);
        }
        return Response.json(!limited);
      }
      if (url.pathname === "/rest/v1/requests") {
        if (fail)
          return Response.json(
            { code: "42P01", message: "private infrastructure detail" },
            { status: 500 },
          );
        if (method === "POST") return new Response(null, { status: 201 });
        if (method === "PATCH" || method === "DELETE")
          return Response.json([{ id }]);
        return Response.json(
          [
            {
              id,
              category: "BUG",
              content: "Test request",
              status: "NEW",
              created_at: "2026-10-08T00:00:00Z",
              updated_at: "2026-10-08T00:00:00Z",
              reviewed_at: null,
              admin_note: "private",
            },
          ],
          { headers: { "content-range": "0-0/1" } },
        );
      }
      throw Error("Unexpected provider call");
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("production create uses strict request Turnstile and isolated quota, never reads Auth or forwards identity", async () => {
  const r = await POST(
    req(
      "POST",
      "/api/requests",
      {
        category: "BUG",
        content: " Example bug 🙂 ",
        turnstile: "fixture-token",
      },
      "itispot_user=account-session",
    ),
  );
  expect(r.status).toBe(201);
  expect(await r.json()).toEqual({ ok: true });
  expect(calls.map((c) => c.url.pathname)).toEqual([
    "/rest/v1/rpc/consume_rate_limit",
    "/turnstile/v0/siteverify",
    "/rest/v1/rpc/consume_rate_limit",
    "/rest/v1/requests",
  ]);
  expect(calls[0].body).toMatchObject({ p_limit: 3, p_window_seconds: 600 });
  expect(calls[0].body?.p_key).toMatch(/^requests:[a-f0-9]{64}$/);
  expect(calls[2].body).toMatchObject({ p_limit: 1, p_window_seconds: 600 });
  expect(calls[2].body?.p_key).toMatch(/^request-turnstile:[a-f0-9]{64}$/);
  expect(calls[3].body).toEqual({ category: "BUG", content: "Example bug 🙂" });
  expect(calls[3].url.search).toBe("");
});
it("production rate denial stops before Turnstile/storage", async () => {
  limited = true;
  const r = await POST(
    req("POST", "/api/requests", {
      category: "BUG",
      content: "Example bug",
      turnstile: "fixture-token",
    }),
  );
  expect(r.status).toBe(429);
  expect(calls).toHaveLength(1);
});
it("Supabase outage fails closed with a safe public message", async () => {
  fail = true;
  const r = await POST(
    req("POST", "/api/requests", {
      category: "BUG",
      content: "Example bug",
      turnstile: "fixture-token",
    }),
  );
  expect(r.status).toBe(503);
  expect(JSON.stringify(await r.json())).not.toMatch(
    /infrastructure|fixture-service|42P01/,
  );
});
it("admin uses the unchanged allowlist and scoped table updates, with private responses", async () => {
  const cookie = "itispot_session=fixture-admin-token";
  const r = await GET(
    req("GET", "/api/admin/requests?filter=NEW&page=2", undefined, cookie),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  const call = calls.find((c) => c.url.pathname === "/rest/v1/requests")!;
  expect(call.url.searchParams.get("status")).toBe("eq.NEW");
  expect(call.url.searchParams.get("offset")).toBe("20");
  const ctx = { params: Promise.resolve({ id }) };
  expect(
    (
      await PATCH(
        req(
          "PATCH",
          "/api/admin/requests/" + id,
          { admin_note: "Updated internal note" },
          cookie,
        ),
        ctx,
      )
    ).status,
  ).toBe(200);
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
    admin_note: "Updated internal note",
  });
  expect(
    (
      await DELETE(
        req("DELETE", "/api/admin/requests/" + id, undefined, cookie),
        ctx,
      )
    ).status,
  ).toBe(200);
});
it("ordinary authenticated UID cannot access admin requests even using an admin cookie name", async () => {
  normal = true;
  const cookie = "itispot_session=fixture-normal-token",
    ctx = { params: Promise.resolve({ id }) };
  expect(
    (await GET(req("GET", "/api/admin/requests", undefined, cookie))).status,
  ).toBe(401);
  expect(
    (
      await PATCH(
        req(
          "PATCH",
          "/api/admin/requests/" + id,
          { status: "COMPLETED" },
          cookie,
        ),
        ctx,
      )
    ).status,
  ).toBe(401);
  expect(calls.every((c) => c.url.pathname === "/auth/v1/user")).toBe(true);
});

it("rejects concurrent replay even when the provider repeats success", async () => {
  const body = { category: "BUG", content: "Replay verification", turnstile: "same-real-token" };
  const results = await Promise.all([POST(req("POST", "/api/requests", body)), POST(req("POST", "/api/requests", body))]);
  expect(results.map(r => r.status).sort()).toEqual([201, 400]);
  expect(calls.filter(c => c.url.pathname === "/rest/v1/requests" && c.method === "POST")).toHaveLength(1);
  expect(JSON.stringify(calls.filter(c => c.url.pathname.includes("consume_rate_limit")))).not.toContain(body.turnstile);
});
it.each(["invalid", new Date(Date.now() - 301000).toISOString(), new Date(Date.now() + 60000).toISOString()])("rejects invalid, expired or future challenge timestamps %s", async (timestamp) => {
  challengeTimestamp = timestamp;
  const r = await POST(req("POST", "/api/requests", { category: "BUG", content: "Expired challenge", turnstile: "old-token" }));
  expect(r.status).toBe(400);
  expect(calls.some(c => c.url.pathname === "/rest/v1/requests")).toBe(false);
});
