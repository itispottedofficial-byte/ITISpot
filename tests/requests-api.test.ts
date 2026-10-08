import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/requests/route";
import { GET } from "@/app/api/admin/requests/route";
import { PATCH, DELETE } from "@/app/api/admin/requests/[id]/route";
import { createRequest, listRequests } from "@/lib/requests";
import { demoSession } from "@/lib/security";
const origin = "http://localhost:3187";
let directory: string;
const req = (
  method: string,
  url: string,
  body?: unknown,
  cookie = "",
  from = origin,
) =>
  new NextRequest(origin + url, {
    method,
    headers: { origin: from, "content-type": "application/json", cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const submit = (body: unknown, cookie = "") =>
  POST(req("POST", "/api/requests", body, cookie));
const valid = { category: "SUGGESTION", content: "  Una bella idea 🙂  " };
const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ITISPOT_MODE", "demo");
  vi.stubEnv("ITISPOT_RUNTIME", "node");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("TRUSTED_IP_HEADER", "");
  vi.stubEnv("TURNSTILE_MODE", "production");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
  directory = await mkdtemp(path.join(tmpdir(), "itispot-requests-"));
  vi.stubEnv("DATA_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});
it.each(["", "itispot_user=normal-account-session"])(
  "accepts submissions independently of cookie %s, saves only identity-free fields, returns no ID",
  async (cookie) => {
    const r = await submit(valid, cookie);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get("cache-control")).toContain("no-store");
    const { requests } = await listRequests("ALL", 1);
    expect(requests[0]).toMatchObject({
      category: "SUGGESTION",
      content: "Una bella idea 🙂",
      status: "NEW",
      admin_note: null,
      reviewed_at: null,
    });
    expect(Object.keys(requests[0]).sort()).toEqual([
      "admin_note",
      "category",
      "content",
      "created_at",
      "id",
      "reviewed_at",
      "status",
      "updated_at",
    ]);
    expect(Number.isFinite(Date.parse(requests[0].created_at))).toBe(true);
  },
);
it.each([
  { category: "bad" },
  { content: "" },
  { content: " \t\n " },
  { content: "abcd" },
  { content: "x".repeat(1001) },
  { content: "hello\0" },
  { status: "ACCEPTED" },
  { admin_note: "hacked" },
  { reviewed_at: "now" },
  { created_at: "now" },
  { id: crypto.randomUUID() },
  { user_id: crypto.randomUUID() },
  { profile_id: crypto.randomUUID() },
  { username: "someone" },
  { email: "private@example.test" },
])("rejects invalid fields and mass assignment %j", async (patch) => {
  expect((await submit({ ...valid, ...patch })).status).toBe(400);
  expect((await listRequests("ALL", 1)).total).toBe(0);
});
it("accepts Unicode and plain HTML without parsing it; allows exactly 1000 emoji", async () => {
  for (const content of [
    "<script>alert(1)</script> 🌊 日本語",
    "🌊".repeat(1000),
  ])
    expect((await submit({ ...valid, content })).status).toBe(201);
  expect((await listRequests("ALL", 1)).total).toBe(2);
});
it("requires a matching Turnstile action/hostname and refuses missing, invalid and replayed provider tokens", async () => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-private-value");
  vi.stubEnv("TURNSTILE_HOSTNAME", "localhost");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect((await submit(valid)).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(
    Response.json({
      success: true,
      action: "spot-submit",
      hostname: "localhost",
    }),
  );
  expect((await submit({ ...valid, turnstile: "wrong-action" })).status).toBe(
    400,
  );
  fetcher.mockResolvedValueOnce(
    Response.json({
      success: true,
      action: "request-submit",
      hostname: "wrong.test",
    }),
  );
  expect((await submit({ ...valid, turnstile: "wrong-host" })).status).toBe(
    400,
  );
  // Reset only isolated quota to exercise provider failures independently.
  await rm(path.join(directory, "store.json"));
  fetcher.mockResolvedValueOnce(
    Response.json({
      success: true,
      action: "request-submit",
      hostname: "localhost",
    }),
  );
  expect((await submit({ ...valid, turnstile: "one-use" })).status).toBe(201);
  fetcher.mockResolvedValueOnce(
    Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] }),
  );
  expect((await submit({ ...valid, turnstile: "one-use" })).status).toBe(400);
  fetcher.mockResolvedValueOnce(Response.json({ success: false }));
  expect((await submit({ ...valid, turnstile: "invalid" })).status).toBe(400);
  expect((await listRequests("ALL", 1)).total).toBe(1);
});
it("limits concurrent attempts to 3/10min in requests scope only", async () => {
  const r = await Promise.all(Array.from({ length: 5 }, () => submit(valid)));
  expect(r.filter((v) => v.status === 201)).toHaveLength(3);
  expect(r.filter((v) => v.status === 429)).toHaveLength(2);
  expect(r.find((v) => v.status === 429)?.headers.get("retry-after")).toBe(
    "600",
  );
  const state = JSON.parse(
    await readFile(path.join(directory, "store.json"), "utf8"),
  );
  expect(Object.keys(state.limits)).toHaveLength(1);
  expect(Object.keys(state.limits)[0]).toMatch(/^requests:[a-f0-9]{64}$/);
  expect(state.spots).toEqual([]);
});
it("denies normal/anonymous private read and all admin mutations", async () => {
  const id = crypto.randomUUID();
  for (const cookie of [
    "",
    "itispot_user=user-session",
    "itispot_session=forged",
  ]) {
    expect(
      (await GET(req("GET", "/api/admin/requests", undefined, cookie))).status,
    ).toBe(401);
    expect(
      (
        await PATCH(
          req(
            "PATCH",
            "/api/admin/requests/" + id,
            { status: "ACCEPTED" },
            cookie,
          ),
          context(id),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await DELETE(
          req("DELETE", "/api/admin/requests/" + id, undefined, cookie),
          context(id),
        )
      ).status,
    ).toBe(401);
  }
});
it("rejects cross-site creation, status updates and deletion", async () => {
  const id = crypto.randomUUID(),
    cookie = "itispot_session=" + demoSession();
  expect(
    (await POST(req("POST", "/api/requests", valid, "", "https://evil.test")))
      .status,
  ).toBe(403);
  expect(
    (
      await PATCH(
        req(
          "PATCH",
          "/api/admin/requests/" + id,
          { status: "ACCEPTED" },
          cookie,
          "https://evil.test",
        ),
        context(id),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await DELETE(
        req("DELETE", "/api/admin/requests/" + id, undefined, cookie, ""),
        context(id),
      )
    ).status,
  ).toBe(403);
});
it("admin reads, filters, paginates, updates all states, edits private notes and deletes", async () => {
  await createRequest("BUG", "Example bug");
  const cookie = "itispot_session=" + demoSession(),
    id = (await listRequests("ALL", 1)).requests[0].id;
  const read = () => GET(req("GET", "/api/admin/requests", undefined, cookie));
  expect((await read()).headers.get("cache-control")).toContain("no-store");
  for (const status of [
    "REVIEWING",
    "ACCEPTED",
    "REJECTED",
    "COMPLETED",
    "NEW",
  ]) {
    expect(
      (
        await PATCH(
          req(
            "PATCH",
            "/",
            { status, admin_note: "Private 🌊 <script>hi</script>" },
            cookie,
          ),
          context(id),
        )
      ).status,
    ).toBe(200);
    const row = (await (await read()).json()).requests[0];
    expect(row.status).toBe(status);
    expect(row.admin_note).toContain("Private");
    expect(Boolean(row.reviewed_at)).toBe(status !== "NEW");
  }
  expect(
    (await PATCH(req("PATCH", "/", { content: "forged" }, cookie), context(id)))
      .status,
  ).toBe(400);
  for (let i = 0; i < 21; i++)
    await createRequest("OTHER", "Page example " + i);
  expect((await listRequests("NEW", 1)).requests).toHaveLength(20);
  expect((await listRequests("NEW", 2)).requests).toHaveLength(2);
  expect((await listRequests("COMPLETED", 1)).total).toBe(0);
  expect(
    (await GET(req("GET", "/api/admin/requests?page=-1", undefined, cookie)))
      .status,
  ).toBe(400);
  expect(
    (await DELETE(req("DELETE", "/", undefined, cookie), context(id))).status,
  ).toBe(200);
  expect(
    (await DELETE(req("DELETE", "/", undefined, cookie), context(id))).status,
  ).toBe(404);
});
it("rejects excessive body and returns controlled service errors", async () => {
  expect((await submit({ ...valid, content: "x".repeat(17000) })).status).toBe(
    413,
  );
  vi.stubEnv("TURNSTILE_SECRET_KEY", "private-test-value");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("unavailable")),
  );
  const r = await submit({ ...valid, turnstile: "token" });
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({
    error: "Servizio momentaneamente non disponibile. Riprova tra poco.",
  });
});
