import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { commentsDatabase } from "./fixtures/comments-database.mjs";
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001",
  bob = "00000000-0000-4000-8000-000000000002";
const spot = "00000000-0000-4000-8000-000000000011",
  pending = "00000000-0000-4000-8000-000000000012";
async function as<T>(role: string, uid: string, work: () => Promise<T>) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  try {
    return await work();
  } finally {
    await db.exec("reset role");
  }
}
async function post(content = "Ciao 🌊", actor = alice) {
  return as(
    "authenticated",
    actor,
    async () =>
      (
        await db.query<{ id: string }>("select create_comment($1,$2) id", [
          spot,
          content,
        ])
      ).rows[0].id,
  );
}
async function list(id = spot) {
  return (
    await db.query<{
      data: {
        comments: {
          id: string;
          username: string;
          content: string;
          own: boolean;
        }[];
        total: number;
      };
    }>("select list_comments($1,0) data", [id])
  ).rows[0].data;
}
beforeAll(async () => {
  db = await commentsDatabase();
  for (const [id, username] of [
    [alice, "alice.qa"],
    [bob, "bob.qa"],
  ])
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [id, { username }],
    );
  await db.query("insert into spots(id,text) values($1,$3),($2,$3)", [
    spot,
    pending,
    "Anonymous spot",
  ]);
});
beforeEach(async () => {
  await db.exec("delete from comments; delete from rate_limits");
  await db.query(
    "update spots set status='approved',archived_at=null where id=$1",
    [spot],
  );
  await db.query("update profiles set username='alice.qa' where id=$1", [
    alice,
  ]);
});
afterAll(async () => {
  await db.close();
});
it("reapplies the migration safely and passes the complete read-only audit", async () => {
  await db.exec(
    await readFile("supabase/migrations/20261005000100_comments.sql", "utf8"),
  );
  await db.exec(await readFile("supabase/verify.sql", "utf8"));
});
it("anonymous reads public comments without identities and cannot write or execute admin RPCs", async () => {
  await post();
  await as("anon", "", async () => {
    const data = await list();
    expect(data.total).toBe(1);
    expect(data.comments[0]).toMatchObject({
      username: "alice.qa",
      own: false,
    });
    expect(Object.keys(data.comments[0]).sort()).toEqual([
      "avatar_key",
      "content",
      "created_at",
      "id",
      "own",
      "username",
    ]);
    expect((await db.query("select content from comments")).rows).toHaveLength(
      1,
    );
    for (const query of [
      "select user_id from comments",
      "insert into comments(content) values('bad')",
      "update comments set content='bad'",
      "delete from comments",
      "select * from comment_reports",
      `select create_comment('${spot}','bad')`,
      `select report_comment(gen_random_uuid(),'bad')`,
      `select admin_comments_page()`,
      `select moderate_comment(gen_random_uuid(),'hide')`,
    ])
      await expect(db.query(query)).rejects.toMatchObject({ code: "42501" });
  });
});
it("derives identity from the session, trims text and keeps HTML as plain text", async () => {
  const content = "<script>globalThis.pwned=true</script> 🙂";
  const id = await post("  " + content + "  ");
  expect(
    (await db.query("select user_id,content from comments where id=$1", [id]))
      .rows[0],
  ).toEqual({ user_id: alice, content });
  await as("authenticated", alice, async () => {
    expect((await list()).comments[0].own).toBe(true);
    await expect(
      db.query("select create_comment($1,$2,$3)", [spot, "impersonation", bob]),
    ).rejects.toMatchObject({ code: "42883" });
  });
});
it.each(["", "   ", "\t\n", "x".repeat(501)])(
  "rejects invalid content in the database (%s)",
  async (content) => {
    await expect(post(content)).rejects.toMatchObject({ code: "22023" });
  },
);
it("accepts 500 emoji using character length rather than UTF-16 length", async () => {
  await post("🌊".repeat(500));
  expect((await list()).total).toBe(1);
});
it("cannot create/read comments on pending, rejected or archived Spots", async () => {
  await post();
  await as("authenticated", alice, async () => {
    await expect(
      db.query("select create_comment($1,$2)", [pending, "bad"]),
    ).rejects.toMatchObject({ code: "P0002" });
  });
  for (const patch of [
    "status='rejected'",
    "status='approved',archived_at=now()",
  ]) {
    await db.query("update spots set " + patch + " where id=$1", [spot]);
    await as("anon", "", async () => {
      await expect(list()).rejects.toMatchObject({ code: "P0002" });
      expect((await db.query("select content from comments")).rows).toEqual([]);
    });
  }
});
it("allows only own deletion, prohibits all editing/mass assignment and keeps other comments intact", async () => {
  const a = await post(),
    b = await post("Bob", bob);
  await as("authenticated", alice, async () => {
    for (const sql of [
      "update comments set content='hacked'",
      "update comments set user_id=gen_random_uuid()",
      "update comments set spot_id=gen_random_uuid()",
      "update comments set status='visible'",
      "update comments set created_at=now()",
      "delete from comments",
      "insert into comments(content) values('bypass')",
    ])
      await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
    expect(
      (await db.query<{ ok: boolean }>("select delete_own_comment($1) ok", [b]))
        .rows[0].ok,
    ).toBe(false);
    expect(
      (await db.query<{ ok: boolean }>("select delete_own_comment($1) ok", [a]))
        .rows[0].ok,
    ).toBe(true);
  });
  expect((await list()).comments.map((c) => c.id)).toEqual([b]);
});
it("enforces five comments per minute even via direct concurrent RPC calls", async () => {
  const attempts = await Promise.allSettled(
    Array.from({ length: 6 }, () => post()),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(1);
  await db.exec("update rate_limits set reset_at=now()-interval '1 second'");
  await expect(post()).resolves.toBeTruthy();
});
it("reflects username changes without snapshots and counts only visible comments", async () => {
  const id = await post();
  await as("authenticated", alice, () =>
    db.query("update profiles set username='alice.new' where id=$1", [alice]),
  );
  expect((await list()).comments[0].username).toBe("alice.new");
  expect(
    (
      await db.query<{ data: Record<string, number> }>(
        "select comment_counts($1) data",
        [[spot, pending]],
      )
    ).rows[0].data,
  ).toEqual({ [spot]: 1 });
  await as("service_role", "", () =>
    db.query("select moderate_comment($1,$2)", [id, "hide"]),
  );
  expect((await list()).total).toBe(0);
});
it("deduplicates reports, hides reporting identity and restricts moderation to service_role", async () => {
  const id = await post();
  await as("authenticated", bob, async () => {
    for (const expected of [true, false])
      expect(
        (
          await db.query<{ ok: boolean }>("select report_comment($1,$2) ok", [
            id,
            "Contenuto offensivo",
          ])
        ).rows[0].ok,
      ).toBe(expected);
    await expect(
      db.query("select admin_comments_page()"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select moderate_comment($1,$2)", [id, "hide"]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  await as("service_role", "", async () => {
    const result = (
      await db.query<{ data: { comments: Record<string, unknown>[] } }>(
        "select admin_comments_page() data",
      )
    ).rows[0].data;
    expect(result.comments[0]).toMatchObject({
      username: "alice.qa",
      report_count: 1,
      reports: [{ reason: "Contenuto offensivo" }],
    });
    expect(JSON.stringify(result)).not.toContain(bob);
    await db.query("select moderate_comment($1,$2)", [id, "hide"]);
  });
  await as("anon", "", async () => expect((await list()).total).toBe(0));
  await as("service_role", "", async () => {
    await db.query("select moderate_comment($1,$2)", [id, "restore"]);
    expect((await list()).total).toBe(1);
    await db.query("select moderate_comment($1,$2)", [id, "delete"]);
  });
  expect((await db.query("select * from comment_reports")).rows).toEqual([]);
});
it("keeps visibility and write guards under accidental permissive policies", async () => {
  await post();
  await db.exec(
    "begin; grant all on comments,comment_reports to anon,authenticated; create policy unsafe on comments for all to anon,authenticated using(true) with check(true); create policy unsafe_reports on comment_reports for all to anon,authenticated using(true) with check(true); update comments set status='hidden'; set local role authenticated",
  );
  try {
    expect((await db.query("select * from comments")).rows).toEqual([]);
    expect(
      (await db.query("update comments set content='hacked' returning id"))
        .rows,
    ).toEqual([]);
    expect((await db.query("delete from comments returning id")).rows).toEqual(
      [],
    );
  } finally {
    await db.exec("rollback");
  }
});
it("cascades account and Spot deletion without adding any author fields to spots", async () => {
  await post();
  await db.exec("begin");
  try {
    await db.query("delete from auth.users where id=$1", [alice]);
    expect((await db.query("select * from comments")).rows).toEqual([]);
  } finally {
    await db.exec("rollback");
  }
  await db.exec("begin");
  try {
    await db.query("delete from spots where id=$1", [spot]);
    expect((await db.query("select * from comments")).rows).toEqual([]);
  } finally {
    await db.exec("rollback");
  }
  const fields = (
    await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name='spots' and table_schema='public'",
    )
  ).rows.map((r) => r.column_name);
  expect(fields).not.toContain("user_id");
  expect(fields).not.toContain("profile_id");
});
