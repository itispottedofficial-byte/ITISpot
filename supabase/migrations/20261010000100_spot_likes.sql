-- Likes are interactions, never authorship. Raw voter lists are private.
begin;
create table if not exists public.spot_likes (
 spot_id uuid not null references public.spots(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(spot_id,user_id)
);
create index if not exists spot_likes_user on public.spot_likes(user_id);
create index if not exists spot_likes_week on public.spot_likes(created_at desc,spot_id);
alter table public.spot_likes enable row level security;
revoke all on public.spot_likes from public,anon,authenticated;
grant all on public.spot_likes to service_role;
drop policy if exists likes_private on public.spot_likes;
create policy likes_private on public.spot_likes as restrictive for all to anon,authenticated using(false) with check(false);
create or replace function public.spot_like_stats(p_spots uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if p_spots is null or cardinality(p_spots)>24 then raise exception 'Invalid batch' using errcode='22023'; end if;
 return (select coalesce(jsonb_object_agg(s.id,jsonb_build_object('count',(select count(*) from public.spot_likes l where l.spot_id=s.id),'liked',exists(select 1 from public.spot_likes l where l.spot_id=s.id and l.user_id=auth.uid()))),'{}'::jsonb) from public.spots s where s.id=any(p_spots) and s.status='approved' and s.archived_at is null);
end $$;
create or replace function public.set_spot_like(p_spot uuid,p_liked boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); begin
 if actor is null then raise exception 'Login required' using errcode='42501'; end if;
 if p_liked is null then raise exception 'Invalid like' using errcode='22023'; end if;
 perform 1 from public.spots where id=p_spot and status='approved' and archived_at is null for share;
 if not found then raise exception 'Spot unavailable' using errcode='P0002'; end if;
 -- Serialise opposing operations on the same pair. A retry of the same desired
 -- state is idempotent and never renews the original like timestamp.
 perform pg_advisory_xact_lock(hashtextextended('like:'||p_spot::text||actor::text,0));
 if not public.consume_rate_limit('spot-like:'||actor::text,30,60) then raise exception 'Too many likes' using errcode='P0429'; end if;
 if p_liked then insert into public.spot_likes(spot_id,user_id) values(p_spot,actor) on conflict do nothing;
 else delete from public.spot_likes where spot_id=p_spot and user_id=actor; end if;
 return public.spot_like_stats(array[p_spot])->p_spot::text;
end $$;
-- Bounded archive projection. No account, moderation or import metadata.
create or replace function public.ranked_spots(p_search text default '',p_page integer default 1,p_sort text default 'recent') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if p_page is null or p_page not between 1 and 100000 or p_sort is null or p_sort not in ('recent','likes','comments','trending') or p_search is null or char_length(p_search)>500 then raise exception 'Invalid filter' using errcode='22023'; end if;
 with candidates as (
 select s.id,s.text,s.created_at,s.image_path,
 (select count(*) from public.spot_likes l where l.spot_id=s.id) likes,
 (select count(*) from public.comments c where c.spot_id=s.id and c.status='visible') comments,
 (select count(*) from public.spot_likes l where l.spot_id=s.id and l.created_at>=now()-interval '7 days' and l.created_at<=now()) weekly
 from public.spots s where s.status='approved' and s.archived_at is null and strpos(lower(s.text),lower(btrim(p_search)))>0
 ), eligible as (select * from candidates where p_sort<>'trending' or weekly>0), page as (
 select * from eligible order by case p_sort when 'likes' then likes when 'comments' then comments when 'trending' then weekly else 0 end desc,created_at desc,id desc limit 24 offset (p_page-1)*24
 ) select jsonb_build_object('total',(select count(*) from eligible),'spots',coalesce((select jsonb_agg(to_jsonb(p) order by case p_sort when 'likes' then likes when 'comments' then comments when 'trending' then weekly else 0 end desc,created_at desc,id desc) from page p),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.spot_like_stats(uuid[]),public.set_spot_like(uuid,boolean),public.ranked_spots(text,integer,text) from public,anon,authenticated;
grant execute on function public.spot_like_stats(uuid[]) to anon,authenticated,service_role;
grant execute on function public.set_spot_like(uuid,boolean) to authenticated;
grant execute on function public.ranked_spots(text,integer,text) to service_role;
commit;
