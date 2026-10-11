-- Anonymous polls. No auth/profile FK or identifying data in votes.
begin;
create table if not exists public.polls (
 id uuid primary key default gen_random_uuid(),
 question text not null check(char_length(btrim(question)) between 5 and 300),
 status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','CLOSED')),
 featured boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closes_at timestamptz,
 check(not featured or status='PUBLISHED'),
 check(closes_at is null or closes_at>created_at)
);
create unique index if not exists polls_one_featured on public.polls(featured) where featured;
create index if not exists polls_public_order on public.polls(created_at desc,id desc) where status<>'DRAFT';
create table if not exists public.poll_options (
 id uuid primary key default gen_random_uuid(),
 poll_id uuid not null references public.polls(id) on delete cascade,
 position smallint not null check(position between 0 and 5),
 label text not null check(char_length(btrim(label)) between 1 and 150),
 unique(poll_id,position),unique(poll_id,id)
);
create unique index if not exists poll_options_unique_label on public.poll_options(poll_id,lower(btrim(label)));
create table if not exists public.poll_votes (
 poll_id uuid not null references public.polls(id) on delete cascade,
 option_id uuid not null,
 voter_hash text not null check(voter_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 primary key(poll_id,voter_hash),
 foreign key(poll_id,option_id) references public.poll_options(poll_id,id)
);
create index if not exists poll_votes_option on public.poll_votes(poll_id,option_id);
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
revoke all on public.polls,public.poll_options,public.poll_votes from public,anon,authenticated;
grant all on public.polls,public.poll_options,public.poll_votes to service_role;
do $$ declare t text; begin
 foreach t in array array['polls','poll_options','poll_votes'] loop
 execute format('drop policy if exists %I on public.%I',t||'_private',t);
 execute format('create policy %I on public.%I as restrictive for all to anon,authenticated using(false) with check(false)',t||'_private',t);
 end loop;
end $$;
-- All writes serialize on their parent row. Options freeze after publication,
-- including the race between a vote and an attempted edit.
create or replace function public.guard_poll_option() returns trigger language plpgsql set search_path='' as $$
declare parent uuid; state text; begin
 parent:=case when TG_OP='DELETE' then old.poll_id else new.poll_id end;
 select status into state from public.polls where id=parent for update;
 if state is not null and state<>'DRAFT' then raise exception 'Options frozen' using errcode='22023'; end if;
 if TG_OP='UPDATE' and (new.id<>old.id or new.poll_id<>old.poll_id) then raise exception 'Immutable identity' using errcode='22023'; end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists poll_option_guard on public.poll_options;
create trigger poll_option_guard before insert or update or delete on public.poll_options for each row execute function public.guard_poll_option();
create or replace function public.poll_projection(p_id uuid,p_voter text default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'question',p.question,'status',case when p.status='PUBLISHED' and p.closes_at<=now() then 'CLOSED' else p.status end,'featured',p.featured,'created_at',p.created_at,'closes_at',p.closes_at,
 'voted',exists(select 1 from public.poll_votes v where v.poll_id=p.id and v.voter_hash=p_voter),
 'total',(select count(*) from public.poll_votes v where v.poll_id=p.id),
 'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'votes',(select count(*) from public.poll_votes v where v.poll_id=p.id and v.option_id=o.id)) order by o.position) from public.poll_options o where o.poll_id=p.id),'[]'::jsonb))
 from public.polls p where p.id=p_id
$$;
create or replace function public.list_polls(p_admin boolean default false,p_offset integer default 0,p_featured boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if p_offset is null or p_offset not between 0 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return jsonb_build_object('total',(select count(*) from public.polls p where (p_admin or p.status<>'DRAFT') and (not p_featured or (p.featured and p.status='PUBLISHED' and (p.closes_at is null or p.closes_at>now())))),
 'polls',coalesce((select jsonb_agg(public.poll_projection(p.id) order by p.created_at desc,p.id desc) from (select * from public.polls where (p_admin or status<>'DRAFT') and (not p_featured or (featured and status='PUBLISHED' and (closes_at is null or closes_at>now()))) order by created_at desc,id desc limit 12 offset p_offset) p),'[]'::jsonb));
end $$;
create or replace function public.admin_poll(p_id uuid,p_action text,p_question text default null,p_options text[] default null,p_closes_at timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.polls; target uuid; label text; pos smallint:=0; begin
 -- One consistent lock order for featured updates and lifecycle operations.
 perform pg_advisory_xact_lock(hashtextextended('poll-admin',0));
 if p_action not in ('save','publish','close','feature','delete') or p_action is null then raise exception 'Invalid action' using errcode='22023'; end if;
 if p_id is not null then select * into item from public.polls where id=p_id for update;
 if not found then raise exception 'Poll unavailable' using errcode='P0002'; end if; end if;
 if p_action='save' then
 if p_id is not null and item.status<>'DRAFT' then raise exception 'Only drafts editable' using errcode='22023'; end if;
 if p_question is null or char_length(btrim(p_question)) not between 5 and 300 or p_options is null or cardinality(p_options) not between 2 and 6 or array_ndims(p_options)<>1 then raise exception 'Invalid poll' using errcode='22023'; end if;
 if p_closes_at is not null and p_closes_at<=now() then raise exception 'Closing date in past' using errcode='22023'; end if;
 foreach label in array p_options loop
 if label is null or char_length(btrim(label)) not between 1 and 150 then raise exception 'Invalid option' using errcode='22023'; end if;
 end loop;
 if (select count(distinct lower(btrim(x))) from unnest(p_options) x)<>cardinality(p_options) then raise exception 'Duplicate options' using errcode='22023'; end if;
 if p_id is null then insert into public.polls(question,closes_at) values(btrim(p_question),p_closes_at) returning id into target;
 else target:=p_id; update public.polls set question=btrim(p_question),closes_at=p_closes_at,updated_at=now() where id=target;delete from public.poll_options where poll_id=target; end if;
 foreach label in array p_options loop insert into public.poll_options(poll_id,position,label) values(target,pos,btrim(label));pos:=pos+1;end loop;
 return target;
 end if;
 if p_id is null then raise exception 'Missing poll' using errcode='22023'; end if;
 if p_action='delete' then
 if item.status<>'DRAFT' then raise exception 'Only drafts deletable' using errcode='22023'; end if;
 delete from public.polls where id=p_id;
 elsif p_action='publish' then
 if item.status<>'DRAFT' or (item.closes_at is not null and item.closes_at<=now()) or (select count(*) from public.poll_options where poll_id=p_id) not between 2 and 6 then raise exception 'Invalid publication' using errcode='22023'; end if;
 update public.polls set featured=false where featured;
 update public.polls set status='PUBLISHED',featured=true,updated_at=now() where id=p_id;
 elsif p_action='close' then
 if item.status<>'PUBLISHED' then raise exception 'Not active' using errcode='22023'; end if;
 update public.polls set status='CLOSED',featured=false,updated_at=now() where id=p_id;
 elsif p_action='feature' then
 if item.status<>'PUBLISHED' or item.closes_at<=now() then raise exception 'Not active' using errcode='22023'; end if;
 update public.polls set featured=false where featured;
 update public.polls set featured=true,updated_at=now() where id=p_id;
 end if;
 return p_id;
end $$;
create or replace function public.vote_poll(p_poll uuid,p_option uuid,p_voter text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.polls; begin
 if p_voter is null or p_voter !~ '^[a-f0-9]{64}$' then raise exception 'Invalid voter' using errcode='22023'; end if;
 select * into item from public.polls where id=p_poll for update;
 if not found then raise exception 'Poll unavailable' using errcode='P0002'; end if;
 if item.status<>'PUBLISHED' or item.closes_at<=now() then raise exception 'Poll closed' using errcode='22023'; end if;
 if not exists(select 1 from public.poll_options where poll_id=p_poll and id=p_option) then raise exception 'Invalid option' using errcode='22023'; end if;
 if exists(select 1 from public.poll_votes where poll_id=p_poll and voter_hash=p_voter) then raise exception 'Already voted' using errcode='23505'; end if;
 insert into public.poll_votes(poll_id,option_id,voter_hash) values(p_poll,p_option,p_voter);
 return public.poll_projection(p_poll,p_voter);
end $$;
revoke all on function public.guard_poll_option(),public.poll_projection(uuid,text),public.list_polls(boolean,integer,boolean),public.admin_poll(uuid,text,text,text[],timestamptz),public.vote_poll(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.poll_projection(uuid,text),public.list_polls(boolean,integer,boolean),public.admin_poll(uuid,text,text,text[],timestamptz),public.vote_poll(uuid,uuid,text) to service_role;
commit;
