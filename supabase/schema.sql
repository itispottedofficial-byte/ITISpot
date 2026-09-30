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
  if p_limit<1 or p_limit>100 or p_window_seconds<1 or p_window_seconds>86400 or length(p_key)>200 then raise exception 'Invalid rate limit parameters'; end if;
  insert into public.rate_limits(key,count,reset_at) values(p_key,1,now()+make_interval(secs=>p_window_seconds))
  on conflict(key) do update set
    count=case when rate_limits.reset_at<=now() then 1 else least(rate_limits.count+1,p_limit+1) end,
    reset_at=case when rate_limits.reset_at<=now() then now()+make_interval(secs=>p_window_seconds) else rate_limits.reset_at end
  returning count into current_count;
  return current_count<=p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

-- Reapplying this file preserves all existing Spots.
create index if not exists rate_limits_reset_idx on public.rate_limits(reset_at);
create or replace function public.force_pending_spot()
returns trigger language plpgsql set search_path=public as $$
begin new.status='pending'; new.archived_at=null; return new; end;
$$;
create or replace trigger spots_insert_pending before insert on public.spots
for each row execute function public.force_pending_spot();
revoke all on function public.force_pending_spot() from public,anon,authenticated;

-- Schedule once daily in Supabase Cron. Hashes are not needed after the window ends.
-- delete from public.rate_limits where reset_at < now();

-- One bounded page plus global counters; search is a literal string, never SQL/filter syntax.
create or replace function public.list_spots_page(p_filter text default 'all',p_search text default '',p_offset integer default 0,p_limit integer default 24)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
  if p_filter is null or p_filter not in ('all','pending','approved','rejected','archived') or p_search is null or length(p_search)>500 or p_offset is null or p_offset<0 or p_offset>2400000 or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid pagination'; end if;
  with filtered as (
    select * from public.spots where
    (case when p_filter='archived' then archived_at is not null else archived_at is null and (p_filter='all' or status=p_filter) end)
    and position(lower(p_search) in lower(text || ' ' || id::text))>0
  ), page as (select * from filtered order by created_at desc,id desc limit p_limit offset p_offset)
  select jsonb_build_object(
    'spots',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'counts',(select jsonb_build_object(
      'all',count(*) filter(where archived_at is null),
      'pending',count(*) filter(where archived_at is null and status='pending'),
      'approved',count(*) filter(where archived_at is null and status='approved'),
      'rejected',count(*) filter(where archived_at is null and status='rejected'),
      'archived',count(*) filter(where archived_at is not null)) from public.spots)
  ) into result;
  return result;
end;
$$;
revoke all on function public.list_spots_page(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.list_spots_page(text,text,integer,integer) to service_role;
create index if not exists spots_queue_idx on public.spots(status,created_at desc,id desc) where archived_at is null;
