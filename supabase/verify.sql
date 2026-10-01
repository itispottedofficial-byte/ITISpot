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
select 'ITISpot schema, grants, RPC and Storage checks passed' as result;
rollback;
