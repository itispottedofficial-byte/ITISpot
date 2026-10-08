import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { commentsDatabase } from "./fixtures/comments-database.mjs";
let db: PGlite;
beforeAll(async () => {
  db = await commentsDatabase();
});
beforeEach(async () => {
  await db.exec("reset role; delete from requests");
});
afterAll(async () => {
  await db.close();
});
async function as(role: string, work: () => Promise<unknown>) {
  await db.exec("set role " + role);
  try {
    return await work();
  } finally {
    await db.exec("reset role");
  }
}
it("replays migration and full remote audit locally", async () => {
  await db.exec(
    await readFile("supabase/migrations/20261008000100_requests.sql", "utf8"),
  );
  await db.exec(await readFile("supabase/verify.sql", "utf8"));
});
it.each(["anon", "authenticated"])(
  "%s has neither table/column access nor a request RPC",
  async (role) => {
    await db.query(
      "insert into requests(category,content) values('BUG','Private request')",
    );
    await as(role, async () => {
      for (const sql of [
        "select * from requests",
        "select content from requests",
        "select admin_note from requests",
        "insert into requests(category,content) values('BUG','forged')",
        "update requests set status='ACCEPTED'",
        "update requests set admin_note='hacked'",
        "delete from requests",
        "select itispot_request_metadata()",
      ]) {
        await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
      }
    });
  },
);
it.each(["anon", "authenticated"])(
  "RLS stays closed for %s if someone accidentally grants access and adds a permissive policy",
  async (role) => {
    await db.exec(
      "begin; insert into requests(category,content) values('BUG','Private request'); grant all on requests to anon,authenticated; create policy unsafe_test on requests for all to anon,authenticated using(true) with check(true); set local role " +
        role,
    );
    try {
      expect((await db.query("select * from requests")).rows).toEqual([]);
      expect(
        (await db.query("update requests set status='COMPLETED' returning id"))
          .rows,
      ).toEqual([]);
      expect(
        (await db.query("delete from requests returning id")).rows,
      ).toEqual([]);
      await expect(
        db.query(
          "insert into requests(category,content) values('OTHER','blocked')",
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("rollback");
    }
  },
);
it("service role can manage private requests but not assign identity, insert status or mutate immutable fields", async () => {
  await as("service_role", async () => {
    const r = await db.query<{
      id: string;
      status: string;
      admin_note: null;
      reviewed_at: null;
    }>(
      "insert into requests(category,content) values('FEATURE_REQUEST','🌊 Unicode test') returning *",
    );
    expect(r.rows[0]).toMatchObject({
      status: "NEW",
      admin_note: null,
      reviewed_at: null,
    });
    const id = r.rows[0].id;
    for (const sql of [
      "insert into requests(category,content,status) values('BUG','bad entry','ACCEPTED')",
      "update requests set content='replacement'",
      "update requests set id=gen_random_uuid()",
      "update requests set created_at=now()",
    ]) {
      await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
    }
    await db.query(
      "update requests set status='ACCEPTED',admin_note='Internal only' where id=$1",
      [id],
    );
    const reviewed = (
      await db.query<{ reviewed_at: Date }>("select reviewed_at from requests")
    ).rows[0].reviewed_at;
    expect(reviewed).toBeTruthy();
    await db.query("update requests set admin_note=null");
    expect(
      (
        await db.query<{ reviewed_at: Date | null }>(
          "select reviewed_at from requests",
        )
      ).rows[0].reviewed_at,
    ).toEqual(reviewed);
    await db.exec("update requests set status='NEW'");
    expect(
      (
        await db.query<{ reviewed_at: Date | null }>(
          "select reviewed_at from requests",
        )
      ).rows[0].reviewed_at,
    ).toBeNull();
    await db.query("delete from requests where id=$1", [id]);
    expect((await db.query("select * from requests")).rows).toEqual([]);
  });
});
it("trigger initializes every row NEW without note and guards immutable fields even for owner", async () => {
  const r = await db.query<{
    id: string;
    status: string;
    admin_note: null;
    reviewed_at: null;
  }>(
    "insert into requests(category,content,status,admin_note,reviewed_at,created_at) values('BUG','Example bug','ACCEPTED','forged',now(),'2000-01-01') returning *",
  );
  expect(r.rows[0]).toMatchObject({
    status: "NEW",
    admin_note: null,
    reviewed_at: null,
  });
  await expect(
    db.query("update requests set content='replacement'"),
  ).rejects.toMatchObject({ code: "42501" });
});
it.each(["", "    ", "abcd", "x".repeat(1001), "hello\u0001"])(
  "DB enforces content bounds",
  async (content) => {
    await expect(
      db.query("insert into requests(category,content) values('BUG',$1)", [
        content,
      ]),
    ).rejects.toThrow();
  },
);
it("DB validates category/status/note, accepts 1000 emoji, stores no identity or foreign keys", async () => {
  await expect(
    db.query(
      "insert into requests(category,content) values('unknown','hello')",
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await db.query("insert into requests(category,content) values('OTHER',$1)", [
    "🌊".repeat(1000),
  ]);
  await expect(
    db.query("update requests set status='PUBLISHED'"),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    db.query("update requests set admin_note=$1", ["a".repeat(2001)]),
  ).rejects.toMatchObject({ code: "23514" });
  const cols = (
    await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name='requests' and table_schema='public'",
    )
  ).rows
    .map((v) => v.column_name)
    .sort();
  expect(cols).toEqual([
    "admin_note",
    "category",
    "content",
    "created_at",
    "id",
    "reviewed_at",
    "status",
    "updated_at",
  ]);
  expect(
    (
      await db.query(
        "select * from pg_constraint where conrelid='requests'::regclass and contype='f'",
      )
    ).rows,
  ).toEqual([]);
});
