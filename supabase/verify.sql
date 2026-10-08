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

-- Comments V1: run only after 20261005000100_comments.sql has been installed.
begin read only;
do $$ declare r text; t text; f text; op text; begin
 foreach t in array array['comments','comment_reports'] loop
  if not exists(select 1 from pg_class where oid=('public.'||t)::regclass and relrowsecurity) then raise exception 'Comments RLS missing'; end if;
  foreach r in array array['anon','authenticated'] loop
   foreach op in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    if op in ('INSERT','UPDATE') then
     if has_any_column_privilege(r,'public.'||t,op) then raise exception 'Unexpected writable comment column'; end if;
    end if;
    if has_table_privilege(r,'public.'||t,op) then raise exception 'Unexpected comment write grant'; end if;
   end loop;
   if has_column_privilege(r,'public.'||t,'user_id','SELECT') then raise exception 'Public author identity leak'; end if;
  end loop;
  if (select count(*) from pg_policies where schemaname='public' and tablename=t and permissive='RESTRICTIVE' and policyname in(t||'_insert_guard',t||'_update_guard',t||'_delete_guard'))<>3 then raise exception 'Comment write guards missing'; end if;
 end loop;
 if has_table_privilege('anon','public.comment_reports','SELECT') or has_table_privilege('authenticated','public.comment_reports','SELECT') then raise exception 'Reports exposed'; end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='comments' and policyname='comments_visibility_guard' and permissive='RESTRICTIVE' and qual like '%comment_spot_visible%') then raise exception 'Comment visibility guard missing'; end if;
 foreach f in array array['comment_spot_visible(uuid)','list_comments(uuid,integer)','comment_counts(uuid[])','create_comment(uuid,text)','delete_own_comment(uuid)','report_comment(uuid,text)','admin_comments_page(text,integer)','moderate_comment(uuid,text)'] loop
  if not exists(select 1 from pg_proc where oid=('public.'||f)::regprocedure and prosecdef and proconfig @> array['search_path=""']) then raise exception 'Unsafe comment function: %',f; end if;
 end loop;
 foreach f in array array['create_comment(uuid,text)','delete_own_comment(uuid)','report_comment(uuid,text)'] loop
  if has_function_privilege('anon','public.'||f,'EXECUTE') or not has_function_privilege('authenticated','public.'||f,'EXECUTE') then raise exception 'Comment writer grants incorrect'; end if;
 end loop;
 foreach f in array array['admin_comments_page(text,integer)','moderate_comment(uuid,text)'] loop
  if has_function_privilege('anon','public.'||f,'EXECUTE') or has_function_privilege('authenticated','public.'||f,'EXECUTE') or not has_function_privilege('service_role','public.'||f,'EXECUTE') then raise exception 'Comment admin grants incorrect'; end if;
 end loop;
 if (select count(*) from pg_constraint where conrelid='public.comments'::regclass and contype='f' and confdeltype='c')<>2 then raise exception 'Comment cascades missing'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='spots' and column_name in ('user_id','profile_id','username','email')) then raise exception 'Spot anonymity regression'; end if;
end $$;
select 'ITISpot comments, grants, RLS and RPC checks passed' as comments_result;
rollback;

-- Requests V1: read-only audit, after 20261008000100_requests.sql.
begin read only;
do $$ declare r text; op text; cols text[]; begin
 if not exists(select 1 from pg_class where oid='public.requests'::regclass and relrowsecurity) then raise exception 'Requests RLS missing'; end if;
 select array_agg(column_name::text order by column_name) into cols from information_schema.columns where table_schema='public' and table_name='requests';
 if cols <> array['admin_note','category','content','created_at','id','reviewed_at','status','updated_at'] then raise exception 'Unexpected request columns or identity association'; end if;
 foreach r in array array['anon','authenticated'] loop
  foreach op in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
   if has_table_privilege(r,'public.requests',op) then raise exception 'Requests client table grant: % %',r,op; end if;
   if op in ('SELECT','INSERT','UPDATE','REFERENCES') and has_any_column_privilege(r,'public.requests',op) then raise exception 'Requests client column grant'; end if;
  end loop;
  if has_function_privilege(r,'public.itispot_request_metadata()','EXECUTE') then raise exception 'Request trigger callable by client'; end if;
 end loop;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='requests' and policyname='requests_private_guard' and permissive='RESTRICTIVE' and cmd='ALL' and qual='false' and with_check='false' and roles @> array['anon','authenticated']::name[]) then raise exception 'Requests private guard missing'; end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='requests' and permissive='PERMISSIVE') then raise exception 'Unexpected requests permissive policy'; end if;
 if not has_table_privilege('service_role','public.requests','SELECT') or not has_table_privilege('service_role','public.requests','DELETE') or not has_column_privilege('service_role','public.requests','content','INSERT') or not has_column_privilege('service_role','public.requests','category','INSERT') or not has_column_privilege('service_role','public.requests','status','UPDATE') or not has_column_privilege('service_role','public.requests','admin_note','UPDATE') then raise exception 'Requests server grants missing'; end if;
 if has_column_privilege('service_role','public.requests','status','INSERT') or has_column_privilege('service_role','public.requests','content','UPDATE') then raise exception 'Requests server grants too broad'; end if;
 if not exists(select 1 from pg_proc where oid='public.itispot_request_metadata()'::regprocedure and not prosecdef and proconfig @> array['search_path=""']) then raise exception 'Unsafe request metadata function'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.requests'::regclass and tgname='requests_metadata' and tgenabled='O' and tgfoid='public.itispot_request_metadata()'::regprocedure) then raise exception 'Request metadata trigger missing'; end if;
 if (select count(*) from pg_constraint where conrelid='public.requests'::regclass and conname in ('requests_category_check','requests_content_check','requests_status_check','requests_note_check'))<>4 then raise exception 'Requests constraints missing'; end if;
 if (select count(*) from pg_indexes where schemaname='public' and tablename='requests' and indexname in ('requests_status_created_idx','requests_created_idx'))<>2 then raise exception 'Requests indexes missing'; end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='requests' and column_name='status' and column_default='''NEW''::text') then raise exception 'Request default status incorrect'; end if;
 if exists(select 1 from pg_constraint where conrelid='public.requests'::regclass and contype='f') then raise exception 'Unexpected request relationship'; end if;
end $$;
select 'ITISpot requests, grants, RLS and metadata checks passed' as requests_result;
rollback;
