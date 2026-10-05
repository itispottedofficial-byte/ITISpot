-- Read-only audit for the SQL Editor. No credentials or Spot data are displayed.
begin read only;
do $$
declare role_name text; table_name text; operation text; function_name text;
begin
  if (select count(*) from information_schema.columns c where c.table_schema='public'
      and c.table_name='spots' and c.column_name in
      ('id','text','status','image_path','created_at','updated_at','archived_at','reviewed_at','rejection_reason')) <> 9 then
    raise exception 'Spot schema incomplete';
  end if;
  foreach table_name in array array['public.spots','public.rate_limits'] loop
    if not exists (select 1 from pg_class where oid=table_name::regclass and relrowsecurity and relforcerowsecurity) then
      raise exception 'RLS missing on %', table_name;
    end if;
    foreach operation in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
      foreach role_name in array array['anon','authenticated'] loop
        if has_table_privilege(role_name,table_name,operation) then
          raise exception 'Unexpected % grant for % on %', operation, role_name, table_name;
        end if;
      end loop;
      if operation <> 'TRUNCATE' and not has_table_privilege('service_role',table_name,operation) then
        raise exception 'Missing backend % grant on %', operation, table_name;
      end if;
    end loop;
  end loop;
  foreach function_name in array array[
    'public.consume_rate_limit(text,integer,integer)',
    'public.list_spots_page(text,text,integer,integer)'
  ] loop
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,function_name,'EXECUTE') then
        raise exception 'Unexpected RPC access: %', role_name;
      end if;
    end loop;
    if not has_function_privilege('service_role',function_name,'EXECUTE') then
      raise exception 'Missing backend RPC grant';
    end if;
    if (select prosecdef from pg_proc where oid=function_name::regprocedure) then
      raise exception 'Unexpected SECURITY DEFINER RPC';
    end if;
  end loop;
  if not exists (select 1 from storage.buckets where id='spot-images' and public=false
      and file_size_limit=10485760 and allowed_mime_types=array['image/webp']) then
    raise exception 'Private bucket configuration incomplete';
  end if;
  if not exists (select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity)
     or not exists (select 1 from pg_class where oid='storage.buckets'::regclass and relrowsecurity) then
    raise exception 'Storage RLS missing';
  end if;
  if (select count(*) from pg_policies where schemaname='storage' and permissive='RESTRICTIVE'
      and ((tablename='objects' and policyname='itispot_private_objects')
        or (tablename='buckets' and policyname='itispot_private_bucket'))
      and roles @> array['anon','authenticated']::name[]) <> 2 then
    raise exception 'Storage restrictive policies missing';
  end if;
end;
$$;
-- Optional-account audit: no email or Auth metadata is selected.
do $$
declare r text; c text;
begin
  if not exists(select 1 from pg_class where oid='public.profiles'::regclass and relrowsecurity and relforcerowsecurity) then
    raise exception 'Profiles RLS missing';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='profiles') <> 5 then
    raise exception 'Unexpected profile fields';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='profiles_username_ci' and indexdef like '%UNIQUE%lower(username)%') then
    raise exception 'Case-insensitive username uniqueness missing';
  end if;
  foreach r in array array['anon','authenticated'] loop
    foreach c in array array['id','username','avatar_key','created_at','updated_at'] loop
      if has_column_privilege(r,'public.profiles',c,'INSERT') or
        (has_column_privilege(r,'public.profiles',c,'UPDATE') and not(r='authenticated' and c='username')) then
        raise exception 'Unexpected writable profile column';
      end if;
    end loop;
    if has_table_privilege(r,'public.profiles','DELETE') or has_table_privilege(r,'public.profiles','TRUNCATE') then
      raise exception 'Unexpected profile destructive grant';
    end if;
    if has_function_privilege(r,'public.itispot_create_profile()','EXECUTE') or has_function_privilege(r,'public.itispot_profile_update()','EXECUTE') then
      raise exception 'Profile trigger executable by client';
    end if;
  end loop;
  if has_column_privilege('anon','public.profiles','id','SELECT') or has_column_privilege('anon','public.profiles','created_at','SELECT') then
    raise exception 'Anonymous profile projection too broad';
  end if;
  if not has_column_privilege('authenticated','public.profiles','username','UPDATE') then raise exception 'Own username update missing'; end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='profiles' and policyname in ('profiles_read','profiles_update_own','profiles_update_guard','profiles_no_insert','profiles_no_delete')) <> 5 then
    raise exception 'Profile policies incomplete';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_guard' and permissive='RESTRICTIVE' and cmd='UPDATE' and qual like '%auth.uid()%id%' and with_check like '%auth.uid()%id%') then
    raise exception 'Profile ownership guard missing';
  end if;
  if not exists(select 1 from pg_proc where oid='public.itispot_create_profile()'::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
    raise exception 'Profile creation function unsafe';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='itispot_auth_user_profile' and tgenabled='O' and tgfoid='public.itispot_create_profile()'::regprocedure) then
    raise exception 'Automatic profile trigger missing';
  end if;
  if exists(select 1 from auth.users u left join public.profiles p on p.id=u.id where p.id is null or p.created_at is distinct from u.created_at) then
    raise exception 'Missing profile or unreliable creation timestamp';
  end if;
end;
$$;
select policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='profiles';
select 'ITISpot profiles, grants, triggers and RLS checks passed' as profiles_result;
select 'ITISpot schema, grants, RPC and Storage checks passed' as result;
rollback;
