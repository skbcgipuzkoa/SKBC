create or replace function public.skbc_database_health()
returns table (
  database_name text,
  database_size_bytes bigint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select current_database()::text, pg_database_size(current_database())::bigint;
$$;

create or replace function public.skbc_table_health()
returns table (
  table_name text,
  row_estimate bigint,
  total_bytes bigint,
  table_bytes bigint,
  index_bytes bigint,
  toast_bytes bigint
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    c.relname::text as table_name,
    coalesce(s.n_live_tup, c.reltuples)::bigint as row_estimate,
    pg_total_relation_size(c.oid)::bigint as total_bytes,
    pg_relation_size(c.oid)::bigint as table_bytes,
    pg_indexes_size(c.oid)::bigint as index_bytes,
    (pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid))::bigint as toast_bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
  order by pg_total_relation_size(c.oid) desc, c.relname asc;
$$;
