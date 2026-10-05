import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => {
  const maybeSingle = vi.fn(),
    single = vi.fn(),
    eq = vi.fn(),
    select = vi.fn(),
    update = vi.fn();
  const query = { maybeSingle, single, eq, select };
  eq.mockReturnValue(query);
  select.mockReturnValue(query);
  update.mockReturnValue(query);
  return {
    query,
    update,
    from: vi.fn(() => ({ ...query, update })),
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      getUser: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      verifyOtp: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
      resend: vi.fn(),
    },
    rateLimit: vi.fn(),
  };
});
vi.mock("@/lib/account", async (original) => ({
  ...(await original<typeof import("@/lib/account")>()),
  serverAccountClient: async () => ({ auth: mock.auth, from: mock.from }),
}));
vi.mock("@/lib/security", async (original) => ({
  ...(await original<typeof import("@/lib/security")>()),
  rateLimit: mock.rateLimit,
}));
import { POST } from "@/app/api/account/[action]/route";
const origin = "http://127.0.0.1:3187";
const uid = "00000000-0000-4000-8000-000000000001";
const signup = {
  username: "pixel.qa",
  email: "qa@example.test",
  password: "GoodPassword-2026",
  confirmPassword: "GoodPassword-2026",
};
function call(
  action: string,
  data: unknown,
  headers: Record<string, string> = {},
) {
  return POST(
    new NextRequest(`${origin}/api/account/${action}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      body: JSON.stringify(data),
    }),
    { params: Promise.resolve({ action }) },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ITISPOT_MODE", "demo");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "fixture-public-key");
  for (const fn of Object.values(mock.auth))
    fn.mockResolvedValue({
      data: { user: { id: uid, email_confirmed_at: "2026-10-04" } },
      error: null,
    });
  mock.query.maybeSingle.mockResolvedValue({ data: null, error: null });
  mock.query.single.mockResolvedValue({
    data: { username: "changed" },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
it("signs up with username only, canonical origin and generic confirmation response", async () => {
  const r = await call("signup", signup);
  expect(r.status).toBe(200);
  expect(mock.auth.signUp).toHaveBeenCalledWith({
    email: signup.email,
    password: signup.password,
    options: {
      data: { username: signup.username },
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });
  expect(await r.text()).not.toContain(uid);
  expect(mock.rateLimit).toHaveBeenCalledWith(
    expect.anything(),
    "account-signup",
    5,
  );
});
it.each(["pixel.qa", "PIXEL.QA"])(
  "reports duplicate usernames case-insensitively: %s",
  async (username) => {
    mock.query.maybeSingle.mockResolvedValue({
      data: { username: "pixel.qa" },
      error: null,
    });
    expect((await call("signup", { ...signup, username })).status).toBe(409);
    expect(mock.query.eq).toHaveBeenCalledWith("username", "pixel.qa");
    expect(mock.auth.signUp).not.toHaveBeenCalled();
  },
);
it("does not disclose an already registered email through signup", async () => {
  const first = await (await call("signup", signup)).json();
  mock.auth.signUp.mockResolvedValue({
    data: { user: { identities: [] } },
    error: null,
  });
  expect(await (await call("signup", signup)).json()).toEqual(first);
});
it.each([
  { ...signup, username: "Ad_m1n" },
  { ...signup, password: "short" },
  { ...signup, confirmPassword: "other-password" },
  { ...signup, role: "admin" },
])("rejects invalid registration before provider call", async (input) => {
  expect((await call("signup", input)).status).toBe(400);
  expect(mock.auth.signUp).not.toHaveBeenCalled();
});
it("login uses verified email and fixed redirect, never returns session credentials", async () => {
  const good = await call("login", {
    email: signup.email,
    password: signup.password,
  });
  expect(await good.json()).toEqual({ ok: true, redirect: "/profilo" });
  mock.auth.signInWithPassword.mockResolvedValue({
    data: { user: null },
    error: { status: 400, code: "invalid_credentials" },
  });
  expect(
    (await call("login", { email: signup.email, password: "wrong" })).status,
  ).toBe(400);
  mock.auth.signInWithPassword.mockResolvedValue({
    data: { user: { id: uid } },
    error: null,
  });
  expect(
    (await call("login", { email: signup.email, password: signup.password }))
      .status,
  ).toBe(401);
});
it("confirms only supported email types; no open redirect", async () => {
  const input = { token_hash: "a".repeat(64), type: "signup" };
  expect(await (await call("confirm", input)).json()).toEqual({
    ok: true,
    redirect: "/profilo",
  });
  expect(
    await (await call("confirm", { ...input, type: "recovery" })).json(),
  ).toEqual({ ok: true, redirect: "/reset-password" });
  expect(
    (await call("confirm", { ...input, next: "https://evil.test" })).status,
  ).toBe(400);
  expect((await call("confirm", { ...input, type: "invite" })).status).toBe(
    400,
  );
});
it("forgot uses canonical redirect and reset requires a verified user", async () => {
  expect((await call("forgot", { email: signup.email })).status).toBe(200);
  expect(mock.auth.resetPasswordForEmail).toHaveBeenCalledWith(signup.email, {
    redirectTo: `${origin}/auth/confirm`,
  });
  mock.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { status: 401 },
  });
  expect(
    (
      await call("reset", {
        password: signup.password,
        confirmPassword: signup.password,
      })
    ).status,
  ).toBe(401);
  expect(mock.auth.updateUser).not.toHaveBeenCalled();
});
it("profile target comes from getUser, not request body, and handles duplicate updates", async () => {
  expect((await call("profile", { username: "changed" })).status).toBe(200);
  expect(mock.query.eq).toHaveBeenCalledWith("id", uid);
  expect(mock.update).toHaveBeenCalledWith({ username: "changed" });
  expect(
    (
      await call("profile", {
        username: "changed",
        id: "other-user",
        role: "admin",
      })
    ).status,
  ).toBe(400);
  mock.query.single.mockResolvedValue({ data: null, error: { code: "23505" } });
  expect((await call("profile", { username: "duplicate" })).status).toBe(409);
});
it("denies anonymous profile updates and cross-origin mutations", async () => {
  mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await call("profile", { username: "changed" })).status).toBe(401);
  expect(
    (await call("logout", {}, { origin: "https://evil.test" })).status,
  ).toBe(403);
  expect(mock.auth.signOut).not.toHaveBeenCalled();
});
it("logs out only the user's current Supabase session", async () => {
  expect((await call("logout", {})).status).toBe(200);
  expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
});
it("fails closed and reports provider outages without leaking error details", async () => {
  mock.auth.signInWithPassword.mockResolvedValue({
    data: {},
    error: { status: 503, message: "secret-provider-detail" },
  });
  const response = await call("login", {
    email: signup.email,
    password: signup.password,
  });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret-provider-detail");
});

it("resends verification with a generic message and the trusted origin", async () => {
  expect((await call("resend", { email: signup.email })).status).toBe(200);
  expect(mock.auth.resend).toHaveBeenCalledWith({
    type: "signup",
    email: signup.email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
});
