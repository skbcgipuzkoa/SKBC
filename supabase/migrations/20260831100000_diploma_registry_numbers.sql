alter table public.exams
  add column if not exists diploma_registry text;

create sequence if not exists public.diploma_registry_seq;

with numbered as (
  select
    id,
    'D' || to_char(exam_date, 'YY') || '-' || lpad((row_number() over (order by exam_date, created_at, id))::text, 4, '0') as registry
  from public.exams
  where diploma_url is not null
    and nullif(trim(coalesce(diploma_registry, '')), '') is null
)
update public.exams e
set diploma_registry = numbered.registry
from numbered
where e.id = numbered.id;

select setval(
  'public.diploma_registry_seq',
  greatest(
    coalesce((select max((regexp_match(diploma_registry, '-([0-9]+)$'))[1]::bigint) from public.exams where diploma_registry ~ '-[0-9]+$'), 0),
    1
  ),
  true
);

create unique index if not exists exams_diploma_registry_key
  on public.exams (diploma_registry)
  where diploma_registry is not null;

create or replace function public.next_diploma_registry(registry_date date)
returns text
language sql
as $$
  select 'D' || to_char(coalesce(registry_date, current_date), 'YY') || '-' || lpad(nextval('public.diploma_registry_seq')::text, 4, '0');
$$;
