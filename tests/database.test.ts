import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
let db: PGlite;
let sql: string;
const bootstrap = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
`;
beforeAll(async () => {
  db = new PGlite();
  sql = await readFile("supabase/schema.sql", "utf8");
  await db.exec(bootstrap);
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
      db.query("update spots set text='unauthorized'"),
    ).rejects.toThrow();
    await expect(db.query("delete from spots")).rejects.toThrow();
    await expect(db.query("select * from rate_limits")).rejects.toThrow();
    await expect(
      db.query("select consume_rate_limit('bypass',5,600)"),
    ).rejects.toThrow();
    await db.exec("reset role");
  }
});

it("tracks reviews and preserves them through archive/restore without publishing", async () => {
  await db.exec("begin; set local role service_role");
  try {
    const inserted = await db.query<{
      id: string;
      status: string;
      reviewed_at: null;
      rejection_reason: null;
    }>(
      "insert into spots(text,status,reviewed_at,rejection_reason) values('review test','approved',now(),'forged') returning id,status,reviewed_at,rejection_reason",
    );
    const row = inserted.rows[0];
    expect(row).toMatchObject({
      status: "pending",
      reviewed_at: null,
      rejection_reason: null,
    });
    await db.query(
      "update spots set status='rejected', rejection_reason='Regole non rispettate' where id=$1",
      [row.id],
    );
    const reviewed = (
      await db.query<{ reviewed_at: unknown }>(
        "select reviewed_at from spots where id=$1",
        [row.id],
      )
    ).rows[0].reviewed_at;
    expect(reviewed).toBeTruthy();
    await db.query("update spots set archived_at=now() where id=$1", [row.id]);
    await db.query("update spots set archived_at=null where id=$1", [row.id]);
    expect(
      (
        await db.query<{ reviewed_at: unknown }>(
          "select reviewed_at from spots where id=$1",
          [row.id],
        )
      ).rows[0].reviewed_at,
    ).toEqual(reviewed);
    await db.query("update spots set status='approved' where id=$1", [row.id]);
    expect(
      (
        await db.query<{ rejection_reason: unknown }>(
          "select rejection_reason from spots where id=$1",
          [row.id],
        )
      ).rows[0].rejection_reason,
    ).toBeNull();
    await db.exec("set local role anon");
    await expect(
      db.query("select * from spots where status='approved'"),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    await db.exec("rollback");
  }
});

it("rejects arbitrary image paths and invalid rejection reasons", async () => {
  await expect(
    db.query(
      "insert into spots(text,image_path) values('invalid','../secret.png')",
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const local = new PGlite();
  try {
    await local.exec(bootstrap);
    await local.exec(sql);
    await local.exec(
      "insert into spots(text) values('reason test'); update spots set status='rejected'",
    );
    for (const reason of [" ", "x".repeat(501)])
      await expect(
        local.query("update spots set rejection_reason=$1", [reason]),
      ).rejects.toMatchObject({ code: "23514" });
  } finally {
    await local.close();
  }
});

it("restrictive policies withstand permissive policies without affecting other buckets", async () => {
  // Simulate a project's pre-existing broad policies. None are removed by migration.
  await db.exec(`begin;
    grant all on spots, rate_limits to anon, authenticated;
    create policy unsafe_spots on spots for all to anon, authenticated using(true) with check(true);
    create policy unsafe_limits on rate_limits for all to anon, authenticated using(true) with check(true);
    create policy unsafe_objects on storage.objects for all to anon, authenticated using(true) with check(true);
    create policy unsafe_buckets on storage.buckets for all to anon, authenticated using(true) with check(true);
    insert into storage.buckets(id,name,public) values('other-bucket','other-bucket',true);
    insert into storage.objects(bucket_id,name) values('spot-images','private.webp'),('other-bucket','other.webp');
  `);
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set local role ${role}`);
      for (const table of ["spots", "rate_limits"])
        expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
      expect((await db.query("select name from storage.objects")).rows).toEqual(
        [{ name: "other.webp" }],
      );
      expect((await db.query("select id from storage.buckets")).rows).toEqual([
        { id: "other-bucket" },
      ]);
      // Savepoints keep the outer test transaction usable after expected errors.
      for (const query of [
        "insert into spots(text) values('bypass')",
        "insert into storage.objects(bucket_id,name) values('spot-images','injected.webp')",
        "update storage.objects set bucket_id='spot-images' where bucket_id='other-bucket'",
      ]) {
        await db.exec("savepoint denial");
        await expect(db.query(query)).rejects.toMatchObject({ code: "42501" });
        await db.exec("rollback to savepoint denial");
      }
      expect(
        (
          await db.query(
            "delete from storage.objects where bucket_id='spot-images' returning id",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await db.query(
            "update storage.buckets set public=true where id='spot-images' returning id",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("update spots set status='approved' returning id"))
          .rows,
      ).toHaveLength(0);
      expect(
        (await db.query("delete from spots returning id")).rows,
      ).toHaveLength(0);
      await db.exec("reset role");
    }
    await db.exec("set local role service_role");
    expect(
      (
        await db.query(
          "select name from storage.objects where bucket_id='spot-images'",
        )
      ).rows,
    ).toEqual([{ name: "private.webp" }]);
    expect((await db.query("select * from spots")).rows.length).toBeGreaterThan(
      0,
    );
  } finally {
    await db.exec("rollback");
  }
});

it("upgrades legacy data, reapplies safely and passes the deployment SQL audit", async () => {
  const legacy = new PGlite();
  try {
    await legacy.exec(bootstrap);
    await legacy.exec(
      await readFile(
        "supabase/migrations/20260930000100_existing_spots.sql",
        "utf8",
      ),
    );
    await legacy.exec(
      "insert into spots(text) values('legacy content'); update spots set status='approved'",
    );
    const original = (
      await legacy.query<Record<string, unknown>>(
        "select id,text,status,created_at,updated_at from spots",
      )
    ).rows[0];
    await legacy.exec(sql);
    await legacy.exec(sql);
    const upgraded = (
      await legacy.query<Record<string, unknown>>("select * from spots")
    ).rows[0];
    expect(upgraded).toMatchObject(original);
    expect(upgraded.reviewed_at).toEqual(original.updated_at);
    await legacy.exec(await readFile("supabase/verify.sql", "utf8"));
  } finally {
    await legacy.close();
  }
});

it.each([
  [null, 5, 600],
  ["", 5, 600],
  ["test", null, 600],
  ["test", 5, null],
  ["test", 101, 600],
])(
  "rejects invalid rate-limit RPC parameters (%s, %s, %s)",
  async (key, limit, seconds) => {
    await expect(
      db.query("select consume_rate_limit($1,$2,$3)", [key, limit, seconds]),
    ).rejects.toThrow();
  },
);
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
