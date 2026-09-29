-- Run in the Supabase SQL Editor. All data access goes through authenticated server routes.
create table if not exists public.spots (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists spots_created_idx on public.spots(created_at desc);
alter table public.spots enable row level security;
revoke all on public.spots from anon, authenticated;
grant all on public.spots to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('spot-images','spot-images',false,10485760,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/webp'];
-- Do not add public SELECT or upload policies for this bucket.

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;
create or replace function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare current_count integer;
begin
  delete from public.rate_limits where reset_at < now();
  insert into public.rate_limits(key,count,reset_at) values(p_key,1,now()+make_interval(secs=>p_window_seconds))
  on conflict(key) do update set count=rate_limits.count+1
  returning count into current_count;
  return current_count<=p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
