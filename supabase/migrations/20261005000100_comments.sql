-- Comments V1. Spots never acquire an author/account field.
-- Public projection is provided by RPC; only service_role can moderate.
begin;
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500 and content ~ '[^[:space:]]'),
  status text not null default 'visible' check (status in ('visible','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300 and reason ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  unique(comment_id,user_id)
);
create index if not exists comments_spot_visible on public.comments(spot_id,created_at desc,id desc) where status='visible';
create index if not exists comments_author on public.comments(user_id);
create index if not exists comment_reports_user on public.comment_reports(user_id);
create index if not exists comment_reports_recent on public.comment_reports(created_at desc);
alter table public.comments enable row level security;
alter table public.comment_reports enable row level security;
revoke all on public.comments, public.comment_reports from public, anon, authenticated;
grant select(id,spot_id,content,created_at,updated_at) on public.comments to anon, authenticated;
grant all on public.comments, public.comment_reports to service_role;

create or replace function public.comment_spot_visible(p_spot uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.spots where id=p_spot and status='approved' and archived_at is null)
$$;
drop policy if exists comments_public on public.comments;
create policy comments_public on public.comments for select to anon,authenticated
 using(status='visible' and public.comment_spot_visible(spot_id));
drop policy if exists comments_visibility_guard on public.comments;
create policy comments_visibility_guard on public.comments as restrictive for select to anon,authenticated
 using(status='visible' and public.comment_spot_visible(spot_id));
-- No direct client writes, even if a permissive policy is accidentally added.
do $$ declare tab text; op text; begin
 foreach tab in array array['comments','comment_reports'] loop
   foreach op in array array['insert','update','delete'] loop
     execute format('drop policy if exists %I on public.%I',tab||'_'||op||'_guard',tab);
     execute format('create policy %I on public.%I as restrictive for %s to anon,authenticated %s',
       tab||'_'||op||'_guard',tab,op,
       case when op='insert' then 'with check(false)' when op='delete' then 'using(false)' else 'using(false) with check(false)' end);
   end loop;
 end loop;
end $$;
drop policy if exists reports_private on public.comment_reports;
create policy reports_private on public.comment_reports as restrictive for select to anon,authenticated using(false);

create or replace function public.list_comments(p_spot uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 if not public.comment_spot_visible(p_spot) then raise exception 'Spot unavailable' using errcode='P0002'; end if;
 select jsonb_build_object('total',(select count(*) from public.comments where spot_id=p_spot and status='visible'),
   'comments',coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]'::jsonb)) into result
 from (select c.id,c.created_at,jsonb_build_object('id',c.id,'content',c.content,'created_at',c.created_at,
   'username',p.username,'avatar_key',p.avatar_key,'own',coalesce(c.user_id=auth.uid(),false)) row_data
   from public.comments c join public.profiles p on p.id=c.user_id
   where c.spot_id=p_spot and c.status='visible' order by c.created_at desc,c.id desc limit 20 offset p_offset) rows;
 return result;
end $$;
create or replace function public.comment_counts(p_spots uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if p_spots is null or cardinality(p_spots)>24 then raise exception 'Invalid batch' using errcode='22023'; end if;
 return (select coalesce(jsonb_object_agg(s.id,(select count(*) from public.comments c where c.spot_id=s.id and c.status='visible')),'{}'::jsonb)
   from public.spots s where s.id=any(p_spots) and s.status='approved' and s.archived_at is null);
end $$;
create or replace function public.create_comment(p_spot uuid,p_content text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); new_id uuid; normalized text:=regexp_replace(p_content,'^[[:space:]]+|[[:space:]]+$','','g'); begin
 if actor is null then raise exception 'Login required' using errcode='42501'; end if;
 if normalized is null or char_length(normalized) not between 1 and 500 then raise exception 'Invalid comment' using errcode='22023'; end if;
 -- Lock the Spot during the insert: concurrent archive/delete cannot publish a comment on a hidden Spot.
 perform 1 from public.spots where id=p_spot and status='approved' and archived_at is null for share;
 if not found then raise exception 'Spot unavailable' using errcode='P0002'; end if;
 if not public.consume_rate_limit('comment-create:'||actor::text,5,60) then raise exception 'Too many comments' using errcode='P0429'; end if;
 insert into public.comments(spot_id,user_id,content) values(p_spot,actor,normalized) returning id into new_id;
 return new_id;
end $$;
create or replace function public.delete_own_comment(p_comment uuid) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
 delete from public.comments where id=p_comment and user_id=auth.uid();
 return found;
end $$;
create or replace function public.report_comment(p_comment uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); normalized text:=regexp_replace(p_reason,'^[[:space:]]+|[[:space:]]+$','','g'); begin
 if actor is null then raise exception 'Login required' using errcode='42501'; end if;
 if normalized is null or char_length(normalized) not between 3 and 300 then raise exception 'Invalid reason' using errcode='22023'; end if;
 perform 1 from public.comments where id=p_comment and status='visible' and public.comment_spot_visible(spot_id) for share;
 if not found then raise exception 'Comment unavailable' using errcode='P0002'; end if;
 if exists(select 1 from public.comment_reports where comment_id=p_comment and user_id=actor) then return false; end if;
 if not public.consume_rate_limit('comment-report:'||actor::text,5,600) then raise exception 'Too many reports' using errcode='P0429'; end if;
 insert into public.comment_reports(comment_id,user_id,reason) values(p_comment,actor,normalized) on conflict(comment_id,user_id) do nothing;
 return found;
end $$;
create or replace function public.admin_comments_page(p_filter text default 'reported',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if p_filter is null or p_filter not in ('reported','hidden','all') or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid filter' using errcode='22023'; end if;
 return (with filtered as (
   select c.*,p.username,p.avatar_key from public.comments c join public.profiles p on p.id=c.user_id
   where p_filter='all' or (p_filter='hidden' and c.status='hidden') or (p_filter='reported' and exists(select 1 from public.comment_reports r where r.comment_id=c.id))
 ), page as (select * from filtered order by created_at desc,id desc limit 20 offset p_offset)
 select jsonb_build_object('total',(select count(*) from filtered),'comments',coalesce((select jsonb_agg(jsonb_build_object(
   'id',c.id,'spot_id',c.spot_id,'content',c.content,'status',c.status,'username',c.username,'avatar_key',c.avatar_key,'created_at',c.created_at,
   'reports',coalesce((select jsonb_agg(jsonb_build_object('reason',r.reason,'created_at',r.created_at) order by r.created_at desc) from
      (select reason,created_at from public.comment_reports where comment_id=c.id order by created_at desc limit 20) r),'[]'::jsonb),
   'report_count',(select count(*) from public.comment_reports where comment_id=c.id)) order by c.created_at desc,c.id desc) from page c),'[]'::jsonb)));
end $$;
create or replace function public.moderate_comment(p_comment uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if p_action='delete' then delete from public.comments where id=p_comment;
 elsif p_action in ('hide','restore') then update public.comments set status=case when p_action='hide' then 'hidden' else 'visible' end, updated_at=now() where id=p_comment;
 else raise exception 'Invalid action' using errcode='22023'; end if;
 return found;
end $$;
revoke all on function public.comment_spot_visible(uuid),public.list_comments(uuid,integer),public.comment_counts(uuid[]),public.create_comment(uuid,text),public.delete_own_comment(uuid),public.report_comment(uuid,text),public.admin_comments_page(text,integer),public.moderate_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.comment_spot_visible(uuid),public.list_comments(uuid,integer),public.comment_counts(uuid[]) to anon,authenticated,service_role;
grant execute on function public.create_comment(uuid,text),public.delete_own_comment(uuid),public.report_comment(uuid,text) to authenticated;
grant execute on function public.admin_comments_page(text,integer),public.moderate_comment(uuid,text) to service_role;
commit;
