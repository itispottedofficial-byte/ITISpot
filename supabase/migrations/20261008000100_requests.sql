-- Requests V1: private, identity-free inbox. Apply after the existing migrations.
-- API server is the only writer; no browser grants, no public RPC.
begin;
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  category text not null constraint requests_category_check check(category in ('SUGGESTION','FEATURE_REQUEST','BUG','REPORT','OTHER')),
  content text not null constraint requests_content_check check(char_length(content) between 5 and 1000 and content=btrim(content,E' \t\n\r\f\v') and content !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  status text not null default 'NEW' constraint requests_status_check check(status in ('NEW','REVIEWING','ACCEPTED','REJECTED','COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  admin_note text constraint requests_note_check check(admin_note is null or (char_length(admin_note)<=2000 and admin_note !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'))
);
create index if not exists requests_status_created_idx on public.requests(status,created_at desc,id desc);
create index if not exists requests_created_idx on public.requests(created_at desc,id desc);
alter table public.requests enable row level security;
-- No permissive client policy. Restrictive guard also survives an accidental grant/policy.
drop policy if exists requests_private_guard on public.requests;
create policy requests_private_guard on public.requests as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on public.requests from public,anon,authenticated,service_role;
-- Also remove any stale column grants when replaying this migration.
do $$ declare c text; begin
 for c in select column_name from information_schema.columns where table_schema='public' and table_name='requests' loop
  execute format('revoke all (%I) on public.requests from public,anon,authenticated,service_role',c);
 end loop;
end $$;
grant select,delete on public.requests to service_role;
grant insert(category,content),update(status,admin_note) on public.requests to service_role;
create or replace function public.itispot_request_metadata() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  new.status:='NEW'; new.admin_note:=null; new.reviewed_at:=null;
  new.created_at:=now(); new.updated_at:=new.created_at;
 else
  if new.id is distinct from old.id or new.category is distinct from old.category or new.content is distinct from old.content or new.created_at is distinct from old.created_at then
   raise exception 'Immutable request fields' using errcode='42501';
  end if;
  new.updated_at:=now();
  new.reviewed_at:=case when new.status='NEW' then null when new.status is distinct from old.status then now() else old.reviewed_at end;
 end if;
 return new;
end $$;
revoke all on function public.itispot_request_metadata() from public,anon,authenticated;
drop trigger if exists requests_metadata on public.requests;
create trigger requests_metadata before insert or update on public.requests for each row execute function public.itispot_request_metadata();
comment on table public.requests is 'Private requests: no account/Spot linkage, no public access. Server validates origin, Turnstile request-submit and requests rate limit.';
commit;
