import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { POST as prepare } from "@/app/api/polls/voter/route";
import { POST as vote } from "@/app/api/polls/vote/route";
import { POST as admin } from "@/app/api/admin/polls/route";
import { POST as like } from "@/app/api/likes/route";
import {
  POLL_COOKIE,
  ensureVoter,
  pollVoter,
  voterCookieValue,
} from "@/lib/poll-voter";
import { pollPercentages } from "@/lib/poll-validation";
import { demoSession } from "@/lib/security";
const origin = "http://localhost:3187",
  id = "00000000-0000-4000-8000-000000000001";
let directory: string;
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc }),
  checkAuthAvailability: vi.fn(),
}));
vi.mock("@/lib/account", () => ({
  serverAccountClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
function req(path: string, body: unknown, cookie = "", from = origin) {
  return new NextRequest(origin + path, {
    method: "POST",
    headers: { origin: from, "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}
async function cookie() {
  const response = await prepare(req("/api/polls/voter", {}));
  return `${POLL_COOKIE}=${response.cookies.get(POLL_COOKIE)!.value}`;
}
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ITISPOT_MODE", "demo");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv(
    "RATE_LIMIT_SECRET",
    "local-fixture-secret-with-more-than-32-characters",
  );
  vi.stubEnv("TRUSTED_IP_HEADER", "");
  vi.stubEnv("SUPABASE_URL", "http://fixture.test");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "fixture");
  directory = await mkdtemp(tmpdir() + "/poll-test-");
  vi.stubEnv("DATA_DIR", directory);
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("cookie is signed, HttpOnly, Secure in production, SameSite lax; hash differs by poll", async () => {
  const response = await prepare(req("/api/polls/voter", {}));
  const c = response.cookies.get(POLL_COOKIE)!;
  expect(c.httpOnly).toBe(true);
  expect(c.sameSite).toBe("lax");
  expect(voterCookieValue(c.value)).toBeTruthy();
  expect(voterCookieValue(c.value.slice(0, -1) + "z")).toBeNull();
  expect(pollVoter(c.value, id)).not.toBe(pollVoter(c.value, "another"));
  vi.stubEnv("NODE_ENV", "production");
  const secure = NextResponse.json({});
  ensureVoter(req("/", {}), secure);
  expect(secure.cookies.get(POLL_COOKIE)?.secure).toBe(true);
});
it("anonymous and logged-in submissions ignore account cookies entirely", async () => {
  const c = await cookie();
  for (const auth of ["", "; itispot_user=personal-account"]) {
    expect(
      (
        await vote(
          req("/api/polls/vote", { poll_id: id, option_id: id }, c + auth),
        )
      ).status,
    ).toBe(201);
  }
  const args = rpc.mock.calls.map((c) => c[1]);
  expect(args[0]).toEqual(args[1]);
  expect(Object.keys(args[0]).sort()).toEqual([
    "p_option",
    "p_poll",
    "p_voter",
  ]);
});
it.each([
  { user_id: id },
  { voter_hash: "a".repeat(64) },
  { votes: 50 },
  { status: "PUBLISHED" },
  { option_id: "bad" },
  { poll_id: "bad" },
])("rejects mass assignment/invalid fields %j", async (patch) => {
  expect(
    (
      await vote(
        req(
          "/api/polls/vote",
          { poll_id: id, option_id: id, ...patch },
          await cookie(),
        ),
      )
    ).status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("missing cookie, cross origin, normal admin and anonymous likes denied", async () => {
  expect(
    (await vote(req("/api/polls/vote", { poll_id: id, option_id: id }))).status,
  ).toBe(409);
  expect(
    (await prepare(req("/api/polls/voter", {}, "", "https://other.test")))
      .status,
  ).toBe(403);
  expect(
    (
      await admin(
        req(
          "/api/admin/polls",
          { id, action: "publish" },
          "itispot_user=normal",
        ),
      )
    ).status,
  ).toBe(401);
  expect(
    (await like(req("/api/likes", { spot_id: id, liked: true }))).status,
  ).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it("existing admin session authorizes only validated actions", async () => {
  expect(
    (
      await admin(
        req(
          "/api/admin/polls",
          { id, action: "publish" },
          "itispot_session=" + demoSession(),
        ),
      )
    ).status,
  ).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "admin_poll",
    expect.objectContaining({ p_id: id, p_action: "publish" }),
  );
});
it("duplicate vote maps to 409; dedicated IP limit is 30 per 10 minutes", async () => {
  const c = await cookie();
  rpc.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
  expect(
    (await vote(req("/api/polls/vote", { poll_id: id, option_id: id }, c)))
      .status,
  ).toBe(409);
  for (let i = 1; i < 30; i++)
    expect(
      (await vote(req("/api/polls/vote", { poll_id: id, option_id: id }, c)))
        .status,
    ).toBe(201);
  expect(
    (await vote(req("/api/polls/vote", { poll_id: id, option_id: id }, c)))
      .status,
  ).toBe(429);
});
it("zero votes and ties produce correct percentages summing to 100", () => {
  const options = [1, 1, 1].map((votes, i) => ({
    id: String(i),
    label: String(i),
    votes,
  }));
  expect(pollPercentages(options, 3)).toEqual([34, 33, 33]);
  expect(
    pollPercentages(
      options.map((o) => ({ ...o, votes: 0 })),
      0,
    ),
  ).toEqual([0, 0, 0]);
});
