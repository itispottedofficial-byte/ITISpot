import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/account", () => ({
  serverAccountClient: async () => ({
    auth: { getUser: mock.getUser },
    rpc: mock.rpc,
  }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({ rpc: mock.rpc }) }));
vi.mock("@/lib/security", () => ({ requireAdmin: mock.requireAdmin }));
import { GET, POST } from "@/app/api/comments/route";
import { DELETE, POST as report } from "@/app/api/comments/[id]/route";
import {
  GET as queue,
  PATCH as moderate,
} from "@/app/api/admin/comments/route";
import { HttpError } from "@/lib/http";
import { commentSchema } from "@/lib/comment-validation";
const origin = "http://127.0.0.1:3187",
  id = "00000000-0000-4000-8000-000000000001";
const req = (method: string, path: string, body?: unknown, from = origin) =>
  new NextRequest(origin + path, {
    method,
    headers: { origin: from, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ITISPOT_MODE", "demo");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("SUPABASE_URL", "http://fixture.test");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "fixture-key");
  mock.getUser.mockResolvedValue({
    data: { user: { id, email_confirmed_at: "2026-10-05" } },
    error: null,
  });
  mock.rpc.mockResolvedValue({ data: true, error: null });
  mock.requireAdmin.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
it("anonymous reads comments with private no-store response and cannot post", async () => {
  mock.getUser.mockResolvedValue({
    data: { user: null },
    error: { status: 400 },
  });
  mock.rpc.mockResolvedValue({ data: { comments: [], total: 0 }, error: null });
  const r = await GET(req("GET", "/api/comments?spot_id=" + id));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    comments: [],
    total: 0,
    authenticated: false,
  });
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  mock.rpc.mockClear();
  expect(
    (
      await POST(
        req("POST", "/api/comments", { spot_id: id, content: "hello" }),
      )
    ).status,
  ).toBe(401);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("passes only normalized text and Spot id to the session-bound RPC", async () => {
  expect(
    (
      await POST(
        req("POST", "/api/comments", { spot_id: id, content: " hi 🌊 " }),
      )
    ).status,
  ).toBe(201);
  expect(mock.rpc).toHaveBeenCalledWith("create_comment", {
    p_spot: id,
    p_content: "hi 🌊",
  });
});
it.each([
  { content: " " },
  { content: "x".repeat(501) },
  { user_id: id },
  { status: "visible" },
  { created_at: "2000-01-01" },
  { email: "private@example.test" },
])("rejects invalid content and mass assignment: %j", async (patch) => {
  const r = await POST(
    req("POST", "/api/comments", { spot_id: id, content: "hello", ...patch }),
  );
  expect(r.status).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("Unicode limit and plain-text HTML are validated without creating executable markup", () => {
  expect(
    commentSchema.safeParse({ spot_id: id, content: "🌊".repeat(500) }).success,
  ).toBe(true);
  expect(
    commentSchema.safeParse({
      spot_id: id,
      content: "<script>alert(1)</script>",
    }).success,
  ).toBe(true);
  expect(
    commentSchema.safeParse({ spot_id: id, content: "nul\0" }).success,
  ).toBe(false);
});
it("protects all comment mutations from cross-origin requests", async () => {
  for (const call of [
    () =>
      POST(
        req(
          "POST",
          "/api/comments",
          { spot_id: id, content: "hi" },
          "https://evil.test",
        ),
      ),
    () =>
      DELETE(
        req("DELETE", "/api/comments/" + id, undefined, "https://evil.test"),
        context,
      ),
    () =>
      report(
        req(
          "POST",
          "/api/comments/" + id,
          { reason: "bad" },
          "https://evil.test",
        ),
        context,
      ),
    () =>
      moderate(
        req(
          "PATCH",
          "/api/admin/comments",
          { id, action: "hide" },
          "https://evil.test",
        ),
      ),
  ])
    expect((await call()).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalled();
});
it("maps database rate limits and unavailable migration to safe errors", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "P0429" } });
  let r = await POST(
    req("POST", "/api/comments", { spot_id: id, content: "hi" }),
  );
  expect(r.status).toBe(429);
  expect(r.headers.get("retry-after")).toBe("60");
  mock.rpc.mockResolvedValue({
    data: null,
    error: { code: "PGRST202", message: "private SQL details" },
  });
  r = await GET(req("GET", "/api/comments?spot_id=" + id));
  expect(r.status).toBe(503);
  expect(JSON.stringify(await r.json())).not.toContain("SQL");
});
it("deletes only through own-user RPC and returns 404 for an unowned id", async () => {
  mock.rpc.mockResolvedValue({ data: false, error: null });
  expect(
    (await DELETE(req("DELETE", "/api/comments/" + id), context)).status,
  ).toBe(404);
  expect(mock.rpc).toHaveBeenCalledWith("delete_own_comment", {
    p_comment: id,
  });
  mock.rpc.mockResolvedValue({ data: true, error: null });
  expect(
    (await DELETE(req("DELETE", "/api/comments/" + id), context)).status,
  ).toBe(200);
});
it("validates reason and rejects report identity spoofing", async () => {
  expect(
    (
      await report(
        req("POST", "/api/comments/" + id, {
          reason: "Spam ripetuto",
          user_id: id,
        }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await report(
        req("POST", "/api/comments/" + id, { reason: "Spam ripetuto" }),
        context,
      )
    ).status,
  ).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith("report_comment", {
    p_comment: id,
    p_reason: "Spam ripetuto",
  });
});
it("requires existing admin authorization for queue and every moderation action", async () => {
  mock.requireAdmin.mockRejectedValue(new HttpError(401, "Accedi"));
  expect((await queue(req("GET", "/api/admin/comments"))).status).toBe(401);
  expect(
    (
      await moderate(
        req("PATCH", "/api/admin/comments", { id, action: "hide" }),
      )
    ).status,
  ).toBe(401);
  expect(mock.rpc).not.toHaveBeenCalled();
  mock.requireAdmin.mockResolvedValue(undefined);
  expect(
    (
      await moderate(
        req("PATCH", "/api/admin/comments", { id, action: "hide" }),
      )
    ).status,
  ).toBe(200);
  expect(mock.rpc).toHaveBeenCalledWith("moderate_comment", {
    p_comment: id,
    p_action: "hide",
  });
});
