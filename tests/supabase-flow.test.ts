import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST as submit } from "@/app/api/spots/route";
import { POST as login } from "@/app/api/admin/session/route";
import { GET as list } from "@/app/api/admin/spots/route";
import { GET as photo } from "@/app/api/admin/images/[id]/route";
import { PATCH as moderate } from "@/app/api/admin/spots/[id]/route";
import type { Spot } from "@/lib/types";

// Real route handlers and Supabase SDK; provider HTTP is an isolated fixture.
// Database policies/triggers are executed separately against PostgreSQL in database.test.ts.
const origin = "https://spot.example";
const admin = "12345678-1234-4234-8234-123456789abc";
const serviceKey = "sb_secret_supabase_flow_test_only";
let records: Map<string, Spot>;
let images: Map<string, Buffer>;
let providerFailure = "";
let calls: { path: string; method: string; authorization: string | null }[];
function req(path: string, method = "GET", body?: BodyInit, cookie = "") {
  return new NextRequest(origin + path, {
    method,
    body,
    headers: {
      origin,
      cookie,
      "cf-connecting-ip": "203.0.113.8",
      ...(typeof body === "string"
        ? { "content-type": "application/json" }
        : {}),
    },
  });
}
beforeEach(() => {
  records = new Map();
  images = new Map();
  calls = [];
  providerFailure = "";
  for (const [key, value] of Object.entries({
    NODE_ENV: "production",
    ITISPOT_MODE: "supabase",
    ITISPOT_RUNTIME: "node",
    APP_ORIGIN: origin,
    SUPABASE_URL: "https://db.example",
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    ADMIN_USER_IDS: admin,
    RATE_LIMIT_SECRET: "test-only-long-secret-more-than-32-characters",
    TRUSTED_IP_HEADER: "cf-connecting-ip",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "fixture-site-key",
    TURNSTILE_SECRET_KEY: "fixture-private-key",
    TURNSTILE_HOSTNAME: "spot.example",
  }))
    vi.stubEnv(key, value);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)),
        path = url.pathname;
      const method = init?.method || "GET";
      const headers = new Headers(init?.headers);
      calls.push({ path, method, authorization: headers.get("authorization") });
      if (providerFailure && path.includes(providerFailure))
        return Response.json(
          { message: "Private provider diagnostics must not reach the client" },
          { status: 503 },
        );
      if (path.endsWith("/siteverify"))
        return Response.json({
          success: true,
          hostname: "spot.example",
          action: String(init?.body).includes("login-token")
            ? "admin-login"
            : "spot-submit",
        });
      if (path.endsWith("/consume_rate_limit")) return Response.json(true);
      if (path === "/auth/v1/token")
        return Response.json({
          access_token: "allowed-admin-token",
          refresh_token: "fixture-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          user: { id: admin, email: "admin@example.test" },
        });
      if (path === "/auth/v1/user")
        return Response.json({
          id:
            headers.get("authorization") === "Bearer allowed-admin-token"
              ? admin
              : "22345678-1234-4234-8234-123456789abc",
        });
      if (path === "/rest/v1/spots") {
        if (method === "POST") {
          const row = JSON.parse(String(init?.body)) as Spot;
          expect(row.status).toBe("pending");
          records.set(row.id, row);
          return new Response(null, { status: 201 });
        }
        const id = url.searchParams.get("id")?.replace(/^eq\./, "") || "";
        if (method === "PATCH") {
          Object.assign(records.get(id)!, JSON.parse(String(init?.body)));
          return new Response(null, { status: 204 });
        }
        if (method === "DELETE") {
          records.delete(id);
          return new Response(null, { status: 204 });
        }
        const row = records.get(id);
        return Response.json(
          headers.get("accept")?.includes("vnd.pgrst.object")
            ? row
            : row
              ? [row]
              : [],
        );
      }
      if (path.endsWith("/list_spots_page")) {
        const { p_filter: filter } = JSON.parse(String(init?.body));
        const rows = [...records.values()];
        const spots = rows.filter((r) =>
          filter === "archived"
            ? r.archived_at
            : !r.archived_at && (filter === "all" || r.status === filter),
        );
        return Response.json({
          spots,
          total: spots.length,
          counts: {
            all: rows.length,
            pending: rows.filter((r) => r.status === "pending").length,
            approved: 0,
            rejected: 0,
            archived: 0,
          },
        });
      }
      if (path.startsWith("/storage/v1/object/")) {
        const name = path.split("/").at(-1)!;
        if (method === "POST") {
          expect(headers.get("content-type")).toBe("image/webp");
          expect(headers.get("x-upsert")).toBe("false");
          images.set(name, Buffer.from(init?.body as Uint8Array));
          return Response.json({ Key: `spot-images/${name}` });
        }
        if (method === "DELETE") {
          for (const key of JSON.parse(String(init?.body)).prefixes)
            images.delete(key);
          return Response.json([]);
        }
        return new Response(new Uint8Array(images.get(name)!), {
          headers: { "content-type": "image/webp" },
        });
      }
      throw new Error(`Unexpected fixture endpoint: ${path}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([false, true])(
  "Supabase submission and moderation with image=%s",
  async (withImage) => {
    const form = new FormData();
    form.set("text", "  Supabase integration QA  ");
    form.set("consent", "true");
    form.set("turnstile", "submit-token");
    form.set("status", "approved");
    form.set("reviewed_at", new Date().toISOString());
    if (withImage) {
      const png = await sharp({
        create: { width: 12, height: 10, channels: 3, background: "blue" },
      })
        .png()
        .withMetadata()
        .toBuffer();
      form.set(
        "image",
        new File([new Uint8Array(png)], "original-private-name.png", {
          type: "image/png",
        }),
      );
    }
    const response = await submit(req("/api/spots", "POST", form));
    expect(response.status).toBe(201);
    const { id, status } = await response.json();
    expect(status).toBe("pending");
    expect(records.get(id)).toMatchObject({
      text: "Supabase integration QA",
      status: "pending",
      reviewed_at: null,
      rejection_reason: null,
      image_path: withImage ? `${id}.webp` : null,
    });
    const context = { params: Promise.resolve({ id }) };
    expect((await list(req("/api/admin/spots"))).status).toBe(401);
    expect((await photo(req(`/api/admin/images/${id}`), context)).status).toBe(
      401,
    );
    const denied = await list(
      req(
        "/api/admin/spots",
        "GET",
        undefined,
        "itispot_session=ordinary-user-token",
      ),
    );
    expect(denied.status).toBe(401);
    const session = await login(
      req(
        "/api/admin/session",
        "POST",
        JSON.stringify({
          email: "admin@example.test",
          password: "fixture-password",
          turnstile: "login-token",
        }),
      ),
    );
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ ok: true });
    const cookie = session.headers.get("set-cookie")!.split(";")[0];
    const queue = await list(
      req("/api/admin/spots?filter=pending", "GET", undefined, cookie),
    );
    expect((await queue.json()).spots[0].id).toBe(id);
    if (withImage) {
      const picture = await photo(
        req(`/api/admin/images/${id}`, "GET", undefined, cookie),
        context,
      );
      expect(picture.status).toBe(200);
      expect(picture.headers.get("cache-control")).toContain("no-store");
      const meta = await sharp(
        Buffer.from(await picture.arrayBuffer()),
      ).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect([...images.keys()]).toEqual([`${id}.webp`]);
    }
    for (const action of [
      "approve",
      "reject",
      "archive",
      "restore",
      "delete",
    ]) {
      const result = await moderate(
        req(
          `/api/admin/spots/${id}`,
          "PATCH",
          JSON.stringify({ action }),
          cookie,
        ),
        context,
      );
      expect(result.status).toBe(200);
      if (action === "approve") {
        expect(records.get(id)?.reviewed_at).toBeTruthy();
        expect((await list(req("/api/admin/spots"))).status).toBe(401);
        expect(
          (await photo(req(`/api/admin/images/${id}`), context)).status,
        ).toBe(401);
      }
    }
    expect(records.size).toBe(0);
    expect(images.size).toBe(0);
    for (const call of calls.filter(
      (c) => c.path.startsWith("/rest/") || c.path.startsWith("/storage/"),
    ))
      expect(call.authorization).toBe(`Bearer ${serviceKey}`);
    expect(
      calls.some(
        (c) =>
          c.path.includes("/object/public/") ||
          c.path.includes("/object/sign/"),
      ),
    ).toBe(false);
  },
);

it("returns a controlled 503 when Supabase data is unavailable", async () => {
  providerFailure = "/rest/v1/spots";
  const form = new FormData();
  form.set("text", "unavailable test");
  form.set("consent", "true");
  form.set("turnstile", "submit-token");
  const response = await submit(req("/api/spots", "POST", form));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toMatch(/diagnostics|sb_secret/);
  expect(records.size).toBe(0);
});

it("does not enable public submission when only Supabase is configured", async () => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
  const response = await submit(req("/api/spots", "POST", new FormData()));
  expect(response.status).toBe(503);
  expect(calls).toHaveLength(0);
});

it("reports Auth outages as 503 instead of rejecting an admin's credentials", async () => {
  providerFailure = "/auth/v1/user";
  const response = await list(
    req(
      "/api/admin/spots",
      "GET",
      undefined,
      "itispot_session=allowed-admin-token",
    ),
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toMatch(/diagnostics|sb_secret/);
});
