-- Optional accounts. This migration never alters spots, admin roles or Storage.
-- Apply only after reviewing ACCOUNTS.md. Existing Auth users get an anonymous
-- generated username, using their actual Auth creation date (no launch-date reset).
begin;

create or replace function public.itispot_valid_username(value text)
returns boolean language sql immutable strict set search_path = '' as $$
  select value ~ '^[A-Za-z0-9._]{3,20}$'
    and regexp_replace(lower(value), '[0-9]', '', 'g') !~ '(^|[._])(admin|administrator|moderator|mod|itispot|official|support|system|root)([._]|$)'
    and regexp_replace(lower(value), '[._0-9]', '', 'g') <> all(array['admin','administrator','moderator','mod','itispot','official','support','system','root'])
    and regexp_replace(translate(lower(value),'013457','oieast'), '[._0-9]', '', 'g') <> all(array['admin','administrator','moderator','mod','itispot','official','support','system','root']);
$$;
revoke all on function public.itispot_valid_username(text) from public;
grant execute on function public.itispot_valid_username(text) to anon, authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null constraint profiles_username_valid check(public.itispot_valid_username(username)),
  avatar_key text default null constraint profiles_avatar_placeholder check(avatar_key is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_ci on public.profiles(lower(username));
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select(username, avatar_key) on public.profiles to anon;
grant select on public.profiles to authenticated;
grant update(username) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to anon, authenticated using(true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists profiles_update_guard on public.profiles;
create policy profiles_update_guard on public.profiles as restrictive for update to anon, authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists profiles_no_insert on public.profiles;
create policy profiles_no_insert on public.profiles as restrictive for insert to anon, authenticated with check(false);
drop policy if exists profiles_no_delete on public.profiles;
create policy profiles_no_delete on public.profiles as restrictive for delete to anon, authenticated using(false);

create or replace function public.itispot_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or new.avatar_key is distinct from old.avatar_key then
    raise exception 'Immutable profile field' using errcode='42501';
  end if;
  new.username := lower(new.username);
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.itispot_profile_update() from public, anon, authenticated;
drop trigger if exists itispot_profile_update on public.profiles;
create trigger itispot_profile_update before update on public.profiles for each row execute function public.itispot_profile_update();

create or replace function public.itispot_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare chosen text;
begin
  -- Client metadata supplies only the username. No role or privilege is copied.
  chosen := lower(new.raw_user_meta_data ->> 'username');
  if chosen is null or not public.itispot_valid_username(chosen) then
    raise exception 'Invalid profile username' using errcode='23514';
  end if;
  insert into public.profiles(id,username,created_at,updated_at)
    values(new.id,chosen,new.created_at,new.created_at);
  return new;
end;
$$;
revoke all on function public.itispot_create_profile() from public, anon, authenticated;
drop trigger if exists itispot_auth_user_profile on auth.users;
create trigger itispot_auth_user_profile after insert on auth.users for each row execute function public.itispot_create_profile();

insert into public.profiles(id,username,created_at,updated_at)
  select u.id, 'user_' || left(replace(u.id::text,'-',''),15), u.created_at, u.created_at
  from auth.users u where not exists(select 1 from public.profiles p where p.id=u.id)
  on conflict(id) do nothing;
commit;
