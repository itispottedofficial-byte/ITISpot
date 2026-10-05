// Loopback-only Supabase HTTP contract fixture. Never imported by the application.
// No external requests, real emails, real users or production credentials.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const users = new Map(),
  sessions = new Map(),
  refresh = new Map(),
  mail = new Map();
const date = "2026-10-04T10:00:00.000Z";
const seed = {
  id: randomUUID(),
  email: "preview@example.test",
  password: "Preview-password-2026",
  username: "pixel.blue",
  confirmed: true,
};
users.set(seed.email, seed);
const view = (u) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  email_confirmed_at: u.confirmed ? date : null,
  created_at: date,
  user_metadata: { username: u.username },
  app_metadata: { provider: "email", providers: ["email"] },
});
function session(u, expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600);
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({ sub: u.id, exp, role: "authenticated" }),
    ).toString("base64url") +
    ".fixture" +
    randomUUID().replaceAll("-", "");
  const refreshToken = randomUUID();
  sessions.set(token, u);
  refresh.set(refreshToken, u);
  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: expired ? -60 : 3600,
    expires_at: exp,
    user: view(u),
  };
}
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3191");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    body = {};
  }
  const send = (status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-supabase-api-version": "2024-01-01",
    });
    res.end(JSON.stringify(value));
  };
  const fail = (message, code = "validation_failed", status = 400) =>
    send(status, { msg: message, message, code });
  const user = sessions.get(req.headers.authorization?.replace(/^Bearer /, ""));
  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/__test/mail")
    return send(200, mail.get(url.searchParams.get("email")) || null);
  if (url.pathname === "/__test/expired") return send(200, session(seed, true));
  if (url.pathname === "/auth/v1/signup") {
    if (users.has(body.email))
      return send(200, { ...view(users.get(body.email)), identities: [] });
    const u = {
      id: randomUUID(),
      email: body.email,
      password: body.password,
      username: body.data.username,
      confirmed: false,
    };
    users.set(u.email, u);
    const token_hash = randomUUID().replaceAll("-", "");
    mail.set(u.email, { token_hash, type: "signup" });
    return send(200, view(u));
  }
  if (url.pathname === "/auth/v1/verify") {
    const entry = [...mail].find(
      ([, v]) => v.token_hash === body.token_hash && v.type === body.type,
    );
    if (!entry) return fail("Invalid link", "otp_expired");
    const u = users.get(entry[0]);
    mail.delete(entry[0]);
    u.confirmed = true;
    return send(200, session(u));
  }
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const u = refresh.get(body.refresh_token);
      if (!u) return fail("Expired refresh", "refresh_token_not_found");
      refresh.delete(body.refresh_token);
      return send(200, session(u));
    }
    const u = users.get(body.email);
    if (!u || u.password !== body.password)
      return fail("Invalid credentials", "invalid_credentials");
    if (!u.confirmed) return fail("Email not confirmed", "email_not_confirmed");
    return send(200, session(u));
  }
  if (url.pathname === "/auth/v1/resend") {
    if (users.has(body.email) && !users.get(body.email).confirmed)
      mail.set(body.email, {
        token_hash: randomUUID().replaceAll("-", ""),
        type: "signup",
      });
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/recover") {
    if (users.has(body.email))
      mail.set(body.email, {
        token_hash: randomUUID().replaceAll("-", ""),
        type: "recovery",
      });
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/logout") {
    sessions.delete(req.headers.authorization?.replace(/^Bearer /, ""));
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/user") {
    if (!user) return fail("Invalid session", "bad_jwt", 401);
    if (req.method === "PUT" && body.password) user.password = body.password;
    return send(200, view(user));
  }
  if (url.pathname === "/rest/v1/profiles") {
    let rows = [...users.values()];
    if (url.searchParams.has("username"))
      rows = rows.filter(
        (u) => u.username === url.searchParams.get("username").slice(3),
      );
    if (url.searchParams.has("id"))
      rows = rows.filter((u) => u.id === url.searchParams.get("id").slice(3));
    if (req.method === "PATCH") {
      if (!user || rows.some((u) => u.id !== user.id))
        return fail("RLS", "42501", 403);
      if (
        [...users.values()].some(
          (u) =>
            u !== user &&
            u.username.toLowerCase() === body.username.toLowerCase(),
        )
      )
        return send(409, { code: "23505" });
      rows.forEach((u) => {
        u.username = body.username;
      });
    }
    const fields = url.searchParams.get("select")?.split(",") || ["username"];
    const records = rows.map((u) =>
      Object.fromEntries(
        Object.entries({
          id: u.id,
          username: u.username,
          avatar_key: null,
          created_at: date,
        }).filter(([k]) => fields.includes(k)),
      ),
    );
    return send(
      200,
      req.headers.accept?.includes("vnd.pgrst.object")
        ? records[0] || null
        : records,
    );
  }
  return fail("Unknown fixture endpoint", "not_found", 404);
}).listen(3191, "127.0.0.1", () =>
  console.log("Local account provider fixture ready"),
);
