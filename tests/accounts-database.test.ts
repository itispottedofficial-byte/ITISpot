import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  usernameSchema,
  signupSchema,
  resetSchema,
} from "@/lib/account-validation";
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
let migration: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    insert into auth.users(id,created_at) values('${alice}','2026-09-29T12:00:00Z');`);
  migration = await readFile(
    "supabase/migrations/20261004000100_accounts_profiles.sql",
    "utf8",
  );
  await db.exec(migration);
  await db.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
    [bob, { username: "user123", role: "admin" }],
  );
});
afterAll(async () => {
  await db.close();
});

it("backfills existing admins without changing Auth or inventing a new creation date; reapplies safely", async () => {
  const before = (await db.query("select * from profiles where id=$1", [alice]))
    .rows;
  expect(before[0]).toMatchObject({
    id: alice,
    username: "user_000000000000400",
  });
  await db.exec(migration);
  expect(
    (await db.query("select * from profiles where id=$1", [alice])).rows,
  ).toEqual(before);
  expect(
    (
      await db.query<{ same: boolean }>(
        "select p.created_at=u.created_at as same from profiles p join auth.users u using(id)",
      )
    ).rows.every((r) => r.same),
  ).toBe(true);
});
it("creates the profile atomically and never copies privileges from metadata", async () => {
  expect(
    (await db.query("select * from profiles where id=$1", [bob])).rows[0],
  ).toMatchObject({ username: "user123", avatar_key: null });
  expect(
    Object.keys(
      (
        await db.query<Record<string, unknown>>(
          "select * from profiles limit 1",
        )
      ).rows[0],
    ).sort(),
  ).toEqual(["avatar_key", "created_at", "id", "updated_at", "username"]);
  await expect(
    db.query("insert into auth.users(raw_user_meta_data) values('{}')"),
  ).rejects.toThrow();
  expect((await db.query("select * from auth.users")).rows).toHaveLength(2);
});
it.each([
  "admin",
  "ADMIN",
  "ad.min",
  "ad_m1n",
  "admin.user",
  "official_itis",
  "super.admin",
  "moderator12",
  "mod",
  "itis.pot",
  "official",
  "support",
  "system",
  "root",
  "ro0t",
  "ab",
  "x".repeat(21),
  "a b",
  "<script>",
])("rejects reserved/invalid username in API and DB: %s", async (username) => {
  expect(usernameSchema.safeParse(username).success).toBe(false);
  await expect(
    db.query("insert into auth.users(raw_user_meta_data) values($1)", [
      { username },
    ]),
  ).rejects.toThrow();
});
it.each(["simon.09", "itis_user", "valid.name", "User123"])(
  "validates allowed username: %s",
  async (username) => {
    expect(usernameSchema.safeParse(username).success).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select itispot_valid_username($1) as ok",
          [username],
        )
      ).rows[0].ok,
    ).toBe(true);
  },
);
it("rejects exact and case-insensitive duplicates atomically", async () => {
  for (const username of ["user123", "USER123"])
    await expect(
      db.query("insert into auth.users(raw_user_meta_data) values($1)", [
        { username },
      ]),
    ).rejects.toMatchObject({ code: "23505" });
});
it("anonymous reads only username/avatar and cannot mutate profiles", async () => {
  await db.exec("set role anon");
  try {
    expect(
      (await db.query("select username,avatar_key from profiles")).rows.length,
    ).toBe(2);
    for (const q of [
      "select * from profiles",
      "update profiles set username='hacker'",
      "delete from profiles",
      "insert into profiles(username) values('hacker')",
      "select itispot_create_profile()",
    ])
      await expect(db.query(q)).rejects.toMatchObject({ code: "42501" });
  } finally {
    await db.exec("reset role");
  }
});
it("authenticated user changes only their own username; other profiles are RLS-filtered", async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${bob}'`);
  try {
    expect(
      (
        await db.query(
          "update profiles set username='new.user' where id=$1 returning username",
          [bob],
        )
      ).rows,
    ).toEqual([{ username: "new.user" }]);
    expect(
      (
        await db.query(
          "update profiles set username='hacked' where id=$1 returning id",
          [alice],
        )
      ).rows,
    ).toEqual([]);
    for (const q of [
      "update profiles set id=gen_random_uuid()",
      "update profiles set created_at=now()",
      "update profiles set avatar_key='https://evil.test/x'",
      "update profiles set updated_at=now()",
      "delete from profiles",
      "select itispot_create_profile()",
    ])
      await expect(db.query(q)).rejects.toMatchObject({ code: "42501" });
  } finally {
    await db.exec("reset role");
  }
});
it("ownership guard withstands an accidental broad policy and fields remain immutable", async () => {
  await db.exec(
    `begin; grant update on profiles to authenticated; create policy bad_update on profiles for update to authenticated using(true) with check(true); set local role authenticated; set local request.jwt.claim.sub='${bob}'`,
  );
  try {
    expect(
      (
        await db.query(
          "update profiles set username='hacked' where id=$1 returning id",
          [alice],
        )
      ).rows,
    ).toEqual([]);
    await db.exec("savepoint immutable");
    await expect(
      db.query("update profiles set created_at=now() where id=$1", [bob]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to savepoint immutable");
  } finally {
    await db.exec("rollback");
  }
});
it("rejects weak passwords, mismatches and arbitrary privilege fields", () => {
  const input = {
    username: "simon.09",
    email: "test@example.test",
    password: "long enough password",
    confirmPassword: "long enough password",
  };
  expect(signupSchema.safeParse(input).success).toBe(true);
  expect(signupSchema.safeParse({ ...input, password: "short" }).success).toBe(
    false,
  );
  expect(signupSchema.safeParse({ ...input, role: "admin" }).success).toBe(
    false,
  );
  expect(
    resetSchema.safeParse({
      password: input.password,
      confirmPassword: "different",
    }).success,
  ).toBe(false);
});
