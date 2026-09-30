import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
let db: PGlite;
let sql: string;
beforeAll(async () => {
  db = new PGlite();
  sql = await readFile("supabase/schema.sql", "utf8");
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  await db.exec(sql);
});
afterAll(async () => {
  await db.close();
});
it("forces every insert to pending even if the caller specifies approved", async () => {
  const result = await db.query<{ status: string; archived_at: unknown }>(
    "insert into spots(text,status,archived_at) values('test','approved',now()) returning status,archived_at",
  );
  expect(result.rows[0]).toEqual({ status: "pending", archived_at: null });
});
it("enforces DB text length and state constraints", async () => {
  await expect(
    db.query("insert into spots(text) values($1)", ["a".repeat(501)]),
  ).rejects.toThrow();
  await expect(
    db.query("update spots set status='published'"),
  ).rejects.toThrow();
});
it("prevents anonymous and ordinary authenticated users from reading or writing spots", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(db.query("select * from spots")).rejects.toThrow();
    await expect(
      db.query("insert into spots(text) values('unauthorized')"),
    ).rejects.toThrow();
    await expect(
      db.query("select consume_rate_limit('bypass',5,600)"),
    ).rejects.toThrow();
    await db.exec("reset role");
  }
});
it("atomically limits concurrent requests and resets expired windows", async () => {
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      db.query<{ ok: boolean }>(
        "select consume_rate_limit('test-key',5,600) as ok",
      ),
    ),
  );
  expect(responses.filter((r) => r.rows[0].ok)).toHaveLength(5);
  await db.exec(
    "update rate_limits set reset_at=now()-interval '1 minute' where key='test-key'",
  );
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select consume_rate_limit('test-key',5,600) as ok",
      )
    ).rows[0].ok,
  ).toBe(true);
});
it("keeps the storage bucket private and allows safe reapplication without losing data", async () => {
  await db.exec(sql);
  expect(
    (
      await db.query<{ public: boolean }>(
        "select public from storage.buckets where id='spot-images'",
      )
    ).rows[0].public,
  ).toBe(false);
  expect((await db.query("select * from spots")).rows).toHaveLength(1);
});

it("paginates beyond 1000 records and treats search syntax as literal text", async () => {
  await db.exec("begin");
  try {
    await db.exec(
      "insert into spots(text) select 'pagination '||i from generate_series(1,1005) i",
    );
    const result = await db.query<{
      data: { spots: unknown[]; total: number; counts: { pending: number } };
    }>("select list_spots_page('pending','pagination',1000,24) as data");
    expect(result.rows[0].data.spots).toHaveLength(5);
    expect(result.rows[0].data.total).toBe(1005);
    expect(result.rows[0].data.counts.pending).toBe(1006);
    const literal = await db.query<{ data: { total: number } }>(
      "select list_spots_page('all',$1,0,24) as data",
      ["%'),or(status.eq.approved)"],
    );
    expect(literal.rows[0].data.total).toBe(0);
    await db.exec("set role anon");
    await expect(db.query("select list_spots_page()")).rejects.toThrow();
  } finally {
    await db.exec("rollback");
  }
});
