-- Add moderation metadata without changing the existing states or publishing data.
begin;

alter table public.spots add column if not exists reviewed_at timestamptz;
alter table public.spots add column if not exists rejection_reason text;

-- Historical reviews did not record their own timestamp. Preserve the last known
-- update as an approximation; do not change created_at or any Spot text/status.
update public.spots set reviewed_at = updated_at
where status in ('approved', 'rejected') and reviewed_at is null;

alter table public.spots drop constraint if exists itispot_review_state;
alter table public.spots add constraint itispot_review_state check (
  (status = 'pending' and reviewed_at is null) or
  (status in ('approved', 'rejected') and reviewed_at is not null)
);
alter table public.spots drop constraint if exists itispot_rejection_reason;
alter table public.spots add constraint itispot_rejection_reason check (
  rejection_reason is null or
  (status = 'rejected' and char_length(btrim(rejection_reason)) between 1 and 500)
);
-- Only server-generated UUID names, never an original filename or arbitrary URL.
-- If pre-existing rows violate this constraint, the migration rolls back intact.
alter table public.spots drop constraint if exists itispot_image_path;
alter table public.spots add constraint itispot_image_path check (
  image_path is null or image_path = id::text || '.webp'
);

create or replace function public.force_pending_spot()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.status = 'pending';
  new.archived_at = null;
  new.reviewed_at = null;
  new.rejection_reason = null;
  return new;
end;
$$;
create or replace function public.track_spot_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Spot identity and creation time are immutable';
  end if;
  new.updated_at = statement_timestamp();
  if new.status = 'pending' then
    new.reviewed_at = null;
  elsif new.status is distinct from old.status or new.reviewed_at is null then
    new.reviewed_at = statement_timestamp();
  end if;
  if new.status <> 'rejected' then new.rejection_reason = null; end if;
  return new;
end;
$$;
create or replace trigger spots_track_review before update on public.spots
for each row execute function public.track_spot_review();
revoke all on function public.force_pending_spot() from public, anon, authenticated;
revoke all on function public.track_spot_review() from public, anon, authenticated;

create index if not exists spots_page_idx on public.spots(created_at desc, id desc);
comment on column public.spots.reviewed_at is
  'Last moderation time; historical rows use their last known updated_at.';
comment on column public.spots.rejection_reason is
  'Optional private reason (1-500 characters), only for rejected Spots. The current UI does not collect it.';
comment on column public.spots.image_path is
  'Private spot-images object name: Spot UUID plus .webp. Never a public URL.';

commit;
