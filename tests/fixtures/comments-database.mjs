// Real PostgreSQL engine, isolated in memory. No remote credentials or I/O.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export async function commentsDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated,service_role;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.buckets enable row level security; alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated,service_role;
 grant all on storage.buckets,storage.objects to anon,authenticated,service_role;`);
  await db.exec(await readFile("supabase/schema.sql", "utf8"));
  return db;
}
