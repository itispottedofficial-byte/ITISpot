import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  verifyTurnstile,
  requireAdmin,
  rateLimit,
  setSession,
  fingerprint,
} from "@/lib/security";
import { NextResponse } from "next/server";
import { createSpot } from "@/lib/repository";
import { POST as login } from "@/app/api/admin/session/route";
const id = "12345678-1234-4234-8234-123456789abc";
const env = {
  NODE_ENV: "production",
  ITISPOT_MODE: "supabase",
  SUPABASE_URL: "https://db.example",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fake_test_key",
  ADMIN_USER_IDS: id,
  APP_ORIGIN: "https://spot.example",
  RATE_LIMIT_SECRET: "test-only-secret-with-at-least-32-characters",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test-site-key",
  TURNSTILE_SECRET_KEY: "test-secret-key",
  TURNSTILE_HOSTNAME: "spot.example",
  TRUSTED_IP_HEADER: "cf-connecting-ip",
};
function req(cookie = "itispot_session=user-test-token") {
  return new NextRequest("https://spot.example/api/admin/spots", {
    headers: { cookie, "cf-connecting-ip": "203.0.113.20" },
  });
}
beforeEach(() => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("validates Turnstile action and hostname and rejects expired tokens", async () => {
  for (const result of [
    { success: false },
    { success: true, hostname: "evil.example", action: "spot-submit" },
    { success: true, hostname: "spot.example", action: "admin-login" },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(result)),
    );
    await expect(verifyTurnstile("token")).rejects.toMatchObject({
      status: 400,
    });
  }
  const fetcher = vi.fn(async () =>
    Response.json({
      success: true,
      hostname: "spot.example",
      action: "spot-submit",
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await verifyTurnstile("valid-token");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = fetcher.mock.calls[0] as unknown[];
  expect(String((body[1] as RequestInit).body)).not.toContain("203.0.113");
});
it("fails closed when Turnstile or the shared rate limit service is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 503 })),
  );
  await expect(verifyTurnstile("token")).rejects.toMatchObject({ status: 503 });
  await expect(rateLimit(req())).rejects.toBeTruthy();
});
it("uses Supabase getUser on every admin request and checks the allowlist", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ id, email: "admin@example.test" }),
  );
  vi.stubGlobal("fetch", fetcher);
  await requireAdmin(req());
  expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain(
    "/auth/v1/user",
  );
  fetcher.mockResolvedValue(
    Response.json({ id: "22345678-1234-4234-8234-123456789abc" }),
  );
  await expect(requireAdmin(req())).rejects.toMatchObject({ status: 401 });
});
it("does not fall back to local storage when Supabase insert fails; cleans uploaded image", async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method || "GET", body: init?.body });
      if (url.includes("/rest/v1/spots"))
        return Response.json(
          { message: "database unavailable" },
          { status: 503 },
        );
      return Response.json({ Key: "image.webp" });
    }),
  );
  await expect(
    createSpot("Pending only", Buffer.from("sanitized-image")),
  ).rejects.toBeTruthy();
  expect(
    calls.some(
      (c) =>
        c.url.includes("/storage/v1/object/spot-images") &&
        c.method === "DELETE",
    ),
  ).toBe(true);
  const insert = calls.find((c) => c.url.includes("/rest/v1/spots"));
  expect(JSON.parse(String(insert?.body)).status).toBe("pending");
});
it("logs an allowed admin in with a secure HttpOnly cookie without returning tokens in JSON", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/rpc/consume_rate_limit")) return Response.json(true);
      if (url.includes("siteverify"))
        return Response.json({
          success: true,
          hostname: "spot.example",
          action: "admin-login",
        });
      if (url.includes("/auth/v1/token"))
        return Response.json({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          user: { id, email: "admin@example.test" },
        });
      throw new Error("Unexpected provider route");
    }),
  );
  const r = await login(
    new NextRequest("https://spot.example/api/admin/session", {
      method: "POST",
      headers: {
        origin: "https://spot.example",
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.20",
      },
      body: JSON.stringify({
        email: "admin@example.test",
        password: "test-only",
        turnstile: "test-token",
      }),
    }),
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
  const cookie = r.headers.get("set-cookie")!;
  for (const flag of ["HttpOnly", "Secure", "SameSite=strict"])
    expect(cookie).toContain(flag);
});
it("requires the trusted proxy IP and only stores an HMAC fingerprint", () => {
  expect(fingerprint(req())).toMatch(/^[a-f0-9]{64}$/);
  expect(fingerprint(req())).not.toContain("203.0.113");
  expect(() => fingerprint(new NextRequest("https://spot.example"))).toThrow();
});
it("caps and flags the production session cookie", () => {
  const response = NextResponse.json({ ok: true });
  setSession(response, "fake");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=3600");
});
