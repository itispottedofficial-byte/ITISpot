import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { commentsDatabase } from "./fixtures/comments-database.mjs";
import type { PGlite } from "@electric-sql/pglite";
let db: PGlite;
const a = "00000000-0000-4000-8000-000000000101",
  b = "00000000-0000-4000-8000-000000000102",
  s = "00000000-0000-4000-8000-000000000111",
  t = "00000000-0000-4000-8000-000000000112";
async function role<T>(name: string, uid: string, fn: () => Promise<T>) {
  await db.exec(`set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function like(id = s, liked = true) {
  return (
    await db.query<{ data: { count: number; liked: boolean } }>(
      "select set_spot_like($1,$2) data",
      [id, liked],
    )
  ).rows[0].data;
}
async function rank(sort = "trending", q = "") {
  return (
    await db.query<{
      data: { spots: { id: string; weekly: number }[]; total: number };
    }>("select ranked_spots($1,1,$2) data", [q, sort])
  ).rows[0].data;
}
beforeAll(async () => {
  db = await commentsDatabase();
  await db.query(
    'insert into auth.users(id,raw_user_meta_data) values($1,\'{"username":"like.a"}\'),($2,\'{"username":"like.b"}\')',
    [a, b],
  );
  await db.query(
    "insert into spots(id,text,created_at) values($1,'Storico 100% 🌊','2026-04-25T18:10:03Z'),($2,'Moderno',now())",
    [s, t],
  );
});
beforeEach(async () => {
  await db.exec(
    "delete from spot_likes;delete from rate_limits;update spots set status='approved',archived_at=null",
  );
});
afterAll(async () => {
  await db.close();
});
it("anon reads only aggregate counts and is denied writes and raw identities", async () => {
  await role("authenticated", a, () => like());
  await role("anon", "", async () => {
    const r = await db.query<{ data: Record<string, unknown> }>(
      "select spot_like_stats(array[$1::uuid]) data",
      [s],
    );
    expect(r.rows[0].data[s]).toEqual({ count: 1, liked: false });
    for (const sql of [
      "select * from spot_likes",
      `select set_spot_like('${s}',true)`,
      "delete from spot_likes",
    ])
      await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
  });
});
it("like/unlike derive actor from session and retries do not duplicate or refresh time", async () => {
  await role("authenticated", a, async () => {
    expect(await like()).toEqual({ count: 1, liked: true });
    expect(await like()).toEqual({ count: 1, liked: true });
  });
  await role("authenticated", b, async () => {
    expect(await like(s, false)).toEqual({ count: 1, liked: false });
    expect(await like()).toEqual({ count: 2, liked: true });
  });
  await role("authenticated", a, async () =>
    expect(await like(s, false)).toEqual({ count: 1, liked: false }),
  );
  expect((await db.query("select user_id from spot_likes")).rows).toEqual([
    { user_id: b },
  ]);
});
it("denies mass assignment and direct writes even for authenticated users", async () => {
  await role("authenticated", a, async () => {
    for (const sql of [
      `insert into spot_likes values('${s}','${b}',now())`,
      `update spot_likes set user_id='${b}'`,
      "select * from spot_likes",
    ])
      await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
  });
});
it("rejects hidden/pending/deleted Spots and hides their stats", async () => {
  await db.query("update spots set status='pending' where id=$1", [s]);
  await role("authenticated", a, () =>
    expect(like()).rejects.toMatchObject({ code: "P0002" }),
  );
  expect(
    (
      await db.query<{ data: unknown }>(
        "select spot_like_stats(array[$1::uuid]) data",
        [s],
      )
    ).rows[0].data,
  ).toEqual({});
});
it("historical Spot can trend from a new like; old likes expire exactly from weekly ranking", async () => {
  expect((await rank()).spots).toEqual([]);
  await role("authenticated", a, () => like());
  expect((await rank()).spots[0].id).toBe(s);
  await db.exec(
    "update spot_likes set created_at=now()-interval '7 days 1 second'",
  );
  expect((await rank()).spots).toEqual([]);
  expect((await rank("likes")).spots[0].id).toBe(s);
  expect((await rank("recent")).spots[0].id).toBe(t);
});
it("ranks ties deterministically, searches literal text, and pages in bounded batches", async () => {
  await role("authenticated", a, async () => {
    await like(s);
    await like(t);
  });
  expect((await rank()).spots.map((x) => x.id)).toEqual([t, s]);
  expect((await rank("likes", "100%")).spots.map((x) => x.id)).toEqual([s]);
  await expect(rank("arbitrary")).rejects.toMatchObject({ code: "22023" });
});
it("database uniqueness survives concurrent insert attempts", async () => {
  await Promise.all(
    Array.from({ length: 8 }, () =>
      db.query(
        "insert into spot_likes(spot_id,user_id) values($1,$2) on conflict do nothing",
        [s, a],
      ),
    ),
  );
  expect(
    (await db.query<{ n: number }>("select count(*)::int n from spot_likes"))
      .rows[0].n,
  ).toBe(1);
});
it("rate limit and Spot identity separation remain database enforced", async () => {
  await role("authenticated", a, async () => {
    for (let i = 0; i < 30; i++) await like(s, i % 2 === 0);
    await expect(like()).rejects.toMatchObject({ code: "P0429" });
  });
  const cols = (
    await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name='spots' and table_schema='public'",
    )
  ).rows.map((x) => x.column_name);
  expect(cols).not.toEqual(expect.arrayContaining(["user_id"]));
  expect(
    cols.some((x) =>
      ["user_id", "profile_id", "username", "email"].includes(x),
    ),
  ).toBe(false);
});
it("ranks visible comments only and paginates a growing archive without transferring all rows", async () => {
  await db.query(
    "insert into comments(spot_id,user_id,content,status) values($1,$3,'visible','visible'),($2,$3,'hidden','hidden'),($2,$3,'hidden again','hidden')",
    [s, t, a],
  );
  expect((await rank("comments")).spots[0].id).toBe(s);
  await db.exec("begin");
  try {
    await db.exec(
      "insert into spots(text) select 'Archive fixture '||n from generate_series(1,240) n; update spots set status='approved' where text like 'Archive fixture %'",
    );
    const first = (
      await db.query<{ data: { total: number; spots: { id: string }[] } }>(
        "select ranked_spots('Archive fixture',1,'likes') data",
      )
    ).rows[0].data;
    const second = (
      await db.query<{ data: { total: number; spots: { id: string }[] } }>(
        "select ranked_spots('Archive fixture',2,'likes') data",
      )
    ).rows[0].data;
    expect(first.total).toBe(240);
    expect(first.spots).toHaveLength(24);
    expect(second.spots).toHaveLength(24);
    expect(
      first.spots.some((x) => second.spots.some((y) => y.id === x.id)),
    ).toBe(false);
  } finally {
    await db.exec("rollback");
  }
});
