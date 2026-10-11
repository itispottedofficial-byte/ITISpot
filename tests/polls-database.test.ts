import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { commentsDatabase } from "./fixtures/comments-database.mjs";
import type { Poll, PollPage } from "@/lib/poll-validation";
let db: PGlite;
const voter = "a".repeat(64);
async function action(
  id: string | null,
  action: string,
  question = "Quale attività preferisci?",
  options = ["Musica", "Sport"],
  closes: string | null = null,
) {
  return (
    await db.query<{ id: string }>("select admin_poll($1,$2,$3,$4,$5) id", [
      id,
      action,
      question,
      options,
      closes,
    ])
  ).rows[0].id;
}
async function projection(id: string, hash: string | null = null) {
  return (
    await db.query<{ data: Poll }>("select poll_projection($1,$2) data", [
      id,
      hash,
    ])
  ).rows[0].data;
}
async function list(admin = false, offset = 0, featured = false) {
  return (
    await db.query<{ data: PollPage }>("select list_polls($1,$2,$3) data", [
      admin,
      offset,
      featured,
    ])
  ).rows[0].data;
}
async function vote(id: string, option: string, hash = voter) {
  return (
    await db.query<{ data: Poll }>("select vote_poll($1,$2,$3) data", [
      id,
      option,
      hash,
    ])
  ).rows[0].data;
}
async function active() {
  const id = await action(null, "save");
  await action(id, "publish");
  return await projection(id);
}
beforeAll(async () => {
  db = await commentsDatabase();
});
beforeEach(async () => {
  await db.exec("truncate poll_votes,poll_options,polls cascade");
});
afterAll(async () => {
  await db.close();
});
it("reapplies migrations and runs complete read-only SQL audit", async () => {
  await db.exec(
    await readFile("supabase/migrations/20261010000100_spot_likes.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/20261010000200_polls.sql", "utf8"),
  );
  await db.exec(await readFile("supabase/verify.sql", "utf8"));
});
it("drafts private, published visible and only one featured", async () => {
  const a = await action(null, "save");
  expect((await list()).total).toBe(0);
  expect((await list(true)).total).toBe(1);
  await action(a, "publish");
  const b = await action(null, "save");
  await action(b, "publish");
  expect((await list(false, 0, true)).polls.map((p) => p.id)).toEqual([b]);
  await action(a, "feature");
  expect((await list(false, 0, true)).polls.map((p) => p.id)).toEqual([a]);
});
it("bounded pagination excludes draft and voting identities", async () => {
  for (let i = 0; i < 14; i++) await active();
  const page = await list();
  expect(page.polls).toHaveLength(12);
  expect(page.total).toBe(14);
  expect((await list(false, 12)).polls).toHaveLength(2);
  expect(JSON.stringify(page)).not.toMatch(
    /voter_hash|user_id|email|profile_id/,
  );
});
it.each(
  [
    [],
    ["a"],
    Array(7).fill("a"),
    ["same", " SAME "],
    ["ok", ""],
    ["a".repeat(151), "ok"],
  ].map((options) => ({ options })),
)("rejects invalid option set %j", async ({ options }) => {
  await expect(
    action(null, "save", "Valida domanda?", options),
  ).rejects.toBeDefined();
});
it("anonymous identity-free vote returns aggregate results; duplicate and mismatched option rejected", async () => {
  const p = await active(),
    other = await active();
  const v = await vote(p.id, p.options[0].id);
  expect(v.total).toBe(1);
  expect(v.voted).toBe(true);
  expect(v.options[0].votes).toBe(1);
  await expect(vote(p.id, p.options[1].id)).rejects.toMatchObject({
    code: "23505",
  });
  await expect(
    vote(p.id, other.options[0].id, "b".repeat(64)),
  ).rejects.toMatchObject({ code: "22023" });
  const cols = (
    await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name='poll_votes'",
    )
  ).rows
    .map((x) => x.column_name)
    .sort();
  expect(cols).toEqual(["created_at", "option_id", "poll_id", "voter_hash"]);
});
it("concurrent duplicate votes create exactly one row", async () => {
  const p = await active();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => vote(p.id, p.options[0].id)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await projection(p.id)).total).toBe(1);
});
it("admin freezes options and cannot delete a live/voted poll", async () => {
  const p = await active();
  await vote(p.id, p.options[0].id);
  await expect(action(p.id, "save")).rejects.toMatchObject({ code: "22023" });
  await expect(action(p.id, "delete")).rejects.toMatchObject({ code: "22023" });
  await expect(
    db.query("update poll_options set label=$2 where id=$1", [
      p.options[0].id,
      "New",
    ]),
  ).rejects.toMatchObject({ code: "22023" });
  await action(p.id, "close");
  await expect(
    vote(p.id, p.options[1].id, "b".repeat(64)),
  ).rejects.toMatchObject({ code: "22023" });
  expect((await list()).polls[0].status).toBe("CLOSED");
});
it("expiry is enforced using database time and removes Home feature", async () => {
  const p = await active();
  await db.exec("select pg_sleep(0.02)");
  await db.query("update polls set closes_at=clock_timestamp() where id=$1", [
    p.id,
  ]);
  await expect(vote(p.id, p.options[0].id)).rejects.toMatchObject({
    code: "22023",
  });
  expect((await list(false, 0, true)).polls).toHaveLength(0);
  expect((await list()).polls[0].status).toBe("CLOSED");
});
it("draft edit and delete are atomic and option labels remain escaped text", async () => {
  const id = await action(null, "save");
  await action(id, "save", "Test <script>alert(1)</script>", ["🌊", "日本語"]);
  expect((await projection(id)).question).toContain("<script>");
  await action(id, "delete");
  expect((await list(true)).total).toBe(0);
});
it.each(["anon", "authenticated"])(
  "%s cannot read vote identities, cast raw votes or call admin RPC",
  async (role) => {
    const p = await active();
    await db.exec(`set role ${role}`);
    try {
      for (const sql of [
        "select * from poll_votes",
        "select * from polls",
        "update polls set featured=true",
        `select admin_poll('${p.id}','close')`,
        `select vote_poll('${p.id}','${p.options[0].id}','${voter}')`,
        `select list_polls(true,0,false)`,
      ])
        await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("reset role");
    }
  },
);
