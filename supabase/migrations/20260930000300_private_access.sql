-- Backend-mediated architecture: browser roles have no direct data access.
-- Auth + ADMIN_USER_IDS are checked by every admin server route BEFORE service-role I/O.
begin;

alter table public.spots enable row level security;
alter table public.spots force row level security;
alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
revoke all on public.spots, public.rate_limits from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.spots, public.rate_limits to service_role;

-- Restrictive policies also protect against accidentally restored client grants
-- or permissive policies. They do not restrict service_role, which bypasses RLS.
drop policy if exists itispot_no_direct_spots on public.spots;
create policy itispot_no_direct_spots on public.spots as restrictive
for all to anon, authenticated using (false) with check (false);
drop policy if exists itispot_no_direct_rate_limits on public.rate_limits;
create policy itispot_no_direct_rate_limits on public.rate_limits as restrictive
for all to anon, authenticated using (false) with check (false);

-- Supabase owns these tables and already enables RLS. Do not alter their owner
-- or revoke permissions globally: other buckets must retain their own policies.
do $$
begin
  if not exists (select 1 from pg_class where oid = 'storage.objects'::regclass and relrowsecurity)
     or not exists (select 1 from pg_class where oid = 'storage.buckets'::regclass and relrowsecurity) then
    raise exception 'Storage RLS must be enabled by Supabase before applying this migration';
  end if;
end;
$$;
drop policy if exists itispot_private_objects on storage.objects;
create policy itispot_private_objects on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'spot-images') with check (bucket_id <> 'spot-images');
drop policy if exists itispot_private_bucket on storage.buckets;
create policy itispot_private_bucket on storage.buckets as restrictive
for all to anon, authenticated
using (id <> 'spot-images') with check (id <> 'spot-images');

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('spot-images', 'spot-images', false, 10485760, array['image/webp'])
on conflict(id) do update set public = false,
  file_size_limit = 10485760, allowed_mime_types = array['image/webp'];

-- No SECURITY DEFINER escalation is needed: only the backend may call this RPC.
create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_count integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 200
     or p_limit is null or p_limit not between 1 and 100
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters';
  end if;
  insert into public.rate_limits(key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict(key) do update set
    count = case when rate_limits.reset_at <= now() then 1 else least(rate_limits.count + 1, p_limit + 1) end,
    reset_at = case when rate_limits.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else rate_limits.reset_at end
  returning count into current_count;
  return current_count <= p_limit;
end;
$$;
alter function public.list_spots_page(text, text, integer, integer) set search_path = '';
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.list_spots_page(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.list_spots_page(text, text, integer, integer) to service_role;

-- Refresh the Data API schema cache after adding columns/functions.
notify pgrst, 'reload schema';
commit;
