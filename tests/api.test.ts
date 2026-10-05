import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST as submit } from "@/app/api/spots/route";
import { GET as list } from "@/app/api/admin/spots/route";
import { GET as photo } from "@/app/api/admin/images/[id]/route";
import { PATCH as action } from "@/app/api/admin/spots/[id]/route";
import { POST as login, DELETE as logout } from "@/app/api/admin/session/route";
import { createSpot, listSpots } from "@/lib/repository";
import { sanitizeImage } from "@/lib/images";
import { stripWebpMetadata } from "@/lib/webp";
import { fingerprint, requireAdmin } from "@/lib/security";
import { guard, boundedJson } from "@/lib/http";
import { assertConfigured, mode } from "@/lib/config";
const origin = "http://localhost:3187";
let directory: string;
function request(
  url: string,
  options: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {},
) {
  return new NextRequest(origin + url, {
    ...options,
    headers: { origin, ...options.headers },
  });
}
function form(
  text = "Spot di prova",
  extras: Record<string, string | File> = {},
) {
  const body = new FormData();
  body.set("text", text);
  body.set("consent", "true");
  for (const [key, value] of Object.entries(extras)) body.set(key, value);
  return request("/api/spots", { method: "POST", body });
}
async function session() {
  const r = await login(request("/api/admin/session", { method: "POST" }));
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")!.split(";")[0];
}
async function patch(id: string, cookie: string, value: string) {
  return action(
    request(`/api/admin/spots/${id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ action: value }),
    }),
    { params: Promise.resolve({ id }) },
  );
}
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ITISPOT_MODE", "demo");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("TRUSTED_IP_HEADER", "");
  vi.stubEnv("ITISPOT_RUNTIME", "node");
  await mkdir(".data", { recursive: true });
  directory = await mkdtemp(path.resolve(".data", "test-"));
  vi.stubEnv("DATA_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("submission and moderation through real route handlers", () => {
  it("ignores account cookies and injected author fields when saving a Spot", async () => {
    const req = form("Logged-in anonymous Spot", {
      user_id: "00000000-0000-4000-8000-000000000001",
      username: "pixel.qa",
    });
    req.headers.set("cookie", "itispot_user=account-session");
    const response = await submit(req);
    expect(response.status).toBe(201);
    expect((await response.json()).status).toBe("pending");
    const saved = (await listSpots("all", "", 1)).spots[0];
    expect(saved).not.toHaveProperty("user_id");
    expect(saved).not.toHaveProperty("username");
    expect(JSON.stringify(saved)).not.toContain("pixel.qa");
  });

  it("saves a pending Spot, privately reads its sanitized image, moderates, archives, restores and deletes", async () => {
    const jpeg = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#0033ff" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const response = await submit(
      form("  Un saluto da ITISpot.  ", {
        image: new File([new Uint8Array(jpeg)], "private-name.jpg", {
          type: "image/jpeg",
        }),
        status: "approved",
      }),
    );
    expect(response.status).toBe(201);
    const { id, status } = await response.json();
    expect(status).toBe("pending");
    expect((await list(request("/api/admin/spots"))).status).toBe(401);
    expect(
      (
        await photo(request("/api/admin/images/" + id), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(401);
    const cookie = await session();
    const read = () =>
      list(request("/api/admin/spots", { headers: { cookie } })).then((r) =>
        r.json(),
      );
    expect((await read()).spots[0]).toMatchObject({
      text: "Un saluto da ITISpot.",
      status: "pending",
    });
    const image = await photo(
      request("/api/admin/images/" + id, { headers: { cookie } }),
      { params: Promise.resolve({ id }) },
    );
    expect(image.headers.get("cache-control")).toContain("no-store");
    const metadata = await sharp(
      Buffer.from(await image.arrayBuffer()),
    ).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBe(30);
    for (const [value, expected] of [
      ["approve", "approved"],
      ["reject", "rejected"],
    ] as const) {
      expect((await patch(id, cookie, value)).status).toBe(200);
      expect((await read()).spots[0].status).toBe(expected);
    }
    await patch(id, cookie, "archive");
    expect(
      (
        await (
          await list(
            request("/api/admin/spots?filter=archived", {
              headers: { cookie },
            }),
          )
        ).json()
      ).spots[0].archived_at,
    ).toBeTruthy();
    await patch(id, cookie, "restore");
    expect((await read()).spots[0]).toMatchObject({
      archived_at: null,
      status: "rejected",
    });
    expect((await patch(id, cookie, "delete")).status).toBe(200);
    expect((await read()).spots).toHaveLength(0);
    expect(
      (
        await photo(
          request("/api/admin/images/" + id, { headers: { cookie } }),
          { params: Promise.resolve({ id }) },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await logout(
          request("/api/admin/session", {
            method: "DELETE",
            headers: { cookie },
          }),
        )
      ).headers.get("set-cookie"),
    ).toContain("Max-Age=0");
  });
  it.each(["", "   ", "a".repeat(501)])(
    "rejects empty or overlong text",
    async (text) => {
      expect((await submit(form(text))).status).toBe(400);
    },
  );
  it("accepts exactly 500 characters", async () => {
    expect((await submit(form("a".repeat(500)))).status).toBe(201);
  });
  it("rejects missing consent, honeypot and duplicate fields", async () => {
    expect((await submit(form("hello", { consent: "false" }))).status).toBe(
      400,
    );
    expect((await submit(form("hello", { website: "bot" }))).status).toBe(400);
    const body = new FormData();
    body.append("text", "hi");
    body.append("text", "other");
    body.set("consent", "true");
    expect(
      (await submit(request("/api/spots", { method: "POST", body }))).status,
    ).toBe(400);
  });
  it("rejects empty, disguised and oversized images", async () => {
    for (const file of [
      new File([], "empty.png", { type: "image/png" }),
      new File(['<svg onload="evil()"/>'], "fake.png", { type: "image/png" }),
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", {
        type: "image/jpeg",
      }),
    ]) {
      expect((await submit(form("image", { image: file }))).status).toBe(400);
    }
  });
  it("enforces the rate limit under concurrent submissions and persists it", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => submit(form())),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(5);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(3);
    expect(
      responses.find((r) => r.status === 429)?.headers.get("retry-after"),
    ).toBe("600");
    expect(
      JSON.parse(await readFile(path.join(directory, "store.json"), "utf8"))
        .spots,
    ).toHaveLength(5);
  });
  it("returns clear 400 errors for malformed JSON, and 413 without trusting content-length", async () => {
    const cookie = await session(),
      id = crypto.randomUUID();
    const bad = await action(
      request("/api/admin/spots/" + id, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(bad.status).toBe(400);
    await expect(
      boundedJson(
        request("/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "a".repeat(5000),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects unauthorized and unknown moderation actions", async () => {
    const id = crypto.randomUUID();
    expect((await patch(id, "", "approve")).status).toBe(401);
    const cookie = await session();
    expect((await patch(id, cookie, "publish")).status).toBe(400);
    expect((await patch(id, cookie, "approve")).status).toBe(404);
  });
});
describe("security boundaries", () => {
  it("rejects missing or foreign Origin and cross-site requests", () => {
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: "" },
      { origin, "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[])
      expect(() => guard(request("/", { method: "POST", headers }))).toThrow();
  });
  it("uses no caller-controlled forwarded IP unless explicitly trusted", () => {
    expect(
      fingerprint(request("/", { headers: { "x-forwarded-for": "1.1.1.1" } })),
    ).toBe(
      fingerprint(request("/", { headers: { "x-forwarded-for": "2.2.2.2" } })),
    );
  });
  it("refuses invalid and tampered demo cookies", async () => {
    const good = await session();
    await expect(
      requireAdmin(request("/", { headers: { cookie: good + "tampered" } })),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      requireAdmin(
        request("/", { headers: { cookie: "itispot_session=demo:NaN.bad" } }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("defaults production to Supabase and prohibits open demo APIs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ITISPOT_MODE", "");
    expect(mode()).toBe("supabase");
    expect(() => assertConfigured()).toThrow();
    vi.stubEnv("ITISPOT_MODE", "demo");
    const r = await login(request("/api/admin/session", { method: "POST" }));
    expect(r.status).toBe(503);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
});
describe("image sanitization", () => {
  it("re-encodes PNG, strips metadata and caps the long edge", async () => {
    const input = await sharp({
      create: { width: 2000, height: 10, channels: 4, background: "#0000ff" },
    })
      .png()
      .withMetadata()
      .toBuffer();
    const output = await sanitizeImage(
      new File([new Uint8Array(input)], "image.png", { type: "image/png" }),
    );
    const info = await sharp(output).metadata();
    expect(info.format).toBe("webp");
    expect(info.width).toBe(1800);
    expect(info.exif).toBeUndefined();
    expect(info.icc).toBeUndefined();
  });
  it("rejects malformed WebP framing", () => {
    expect(() => stripWebpMetadata(Buffer.from("short"))).toThrow();
  });
});

it("paginates the demo with global counts and validates API filters", async () => {
  for (let i = 0; i < 26; i++) await createSpot(`pagination ${i}`);
  const first = await listSpots("pending", "pagination", 1),
    second = await listSpots("pending", "pagination", 2);
  expect(first.spots).toHaveLength(24);
  expect(second.spots).toHaveLength(2);
  expect(new Set([...first.spots, ...second.spots].map((s) => s.id)).size).toBe(
    26,
  );
  expect(second.total).toBe(26);
  expect(second.counts.pending).toBe(26);
  expect(
    (await listSpots("all", second.spots[0].id.slice(0, 8))).spots,
  ).toHaveLength(1);
  const cookie = await session();
  expect(
    (await list(request("/api/admin/spots?page=-1", { headers: { cookie } })))
      .status,
  ).toBe(400);
});
