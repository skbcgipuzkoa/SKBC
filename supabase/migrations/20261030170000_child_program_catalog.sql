set local lock_timeout = '5s';

create table if not exists public.child_syllabus_contents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'otro',
  description text,
  archived_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.child_syllabus_contents enable row level security;

alter table public.child_syllabus_items
  add column if not exists content_id uuid references public.child_syllabus_contents(id);

insert into public.child_syllabus_contents (
  id,
  title,
  category,
  description,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  item.id,
  item.title,
  coalesce(item.category, 'otro'),
  item.description,
  item.created_by,
  item.updated_by,
  item.created_at,
  item.updated_at
from public.child_syllabus_items item
where not exists (
  select 1
  from public.child_syllabus_contents content
  where content.id = item.id
);

update public.child_syllabus_items
set content_id = id
where content_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname = 'child_syllabus_items_content_id_not_null'
      and constraint_record.conrelid = 'public.child_syllabus_items'::regclass
  ) then
    alter table public.child_syllabus_items
      add constraint child_syllabus_items_content_id_not_null
      check (content_id is not null) not valid;
  end if;
end;
$$;

alter table public.child_syllabus_items
  validate constraint child_syllabus_items_content_id_not_null;

alter table public.child_syllabus_items
  alter column content_id set not null;

alter table public.child_syllabus_items
  drop constraint if exists child_syllabus_items_content_id_not_null;

-- Supabase runs migrations transactionally, so these indexes cannot use concurrently.
create unique index if not exists child_syllabus_items_content_grade_unique
  on public.child_syllabus_items (content_id, upper(trim(grade)))
  where content_id is not null;

create index if not exists exam_event_items_child_syllabus_item_idx
  on public.exam_event_items (child_syllabus_item_id);

create index if not exists child_class_plans_syllabus_item_ids_gin_idx
  on public.child_class_plans using gin (syllabus_item_ids);

create or replace function public.sync_child_syllabus_assignment_content()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  select
    content.title,
    content.category,
    content.description
  into
    new.title,
    new.category,
    new.description
  from public.child_syllabus_contents content
  where content.id = new.content_id;

  return new;
end;
$$;

drop trigger if exists sync_child_syllabus_assignment_content on public.child_syllabus_items;

create trigger sync_child_syllabus_assignment_content
before insert or update on public.child_syllabus_items
for each row
execute function public.sync_child_syllabus_assignment_content();

create or replace function public.sync_child_syllabus_content_assignments()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.child_syllabus_items
  set
    title = new.title,
    category = new.category,
    description = new.description,
    updated_at = now(),
    updated_by = coalesce(new.updated_by, updated_by)
  where content_id = new.id
    and (
      title is distinct from new.title
      or category is distinct from new.category
      or description is distinct from new.description
    );

  return new;
end;
$$;

drop trigger if exists sync_child_syllabus_content_assignments on public.child_syllabus_contents;

create trigger sync_child_syllabus_content_assignments
after update of title, category, description on public.child_syllabus_contents
for each row
when (
  old.title is distinct from new.title
  or old.category is distinct from new.category
  or old.description is distinct from new.description
)
execute function public.sync_child_syllabus_content_assignments();

create or replace function public.child_syllabus_item_usage(p_syllabus_item_id uuid)
returns table (
  history_count bigint,
  class_plan_count bigint,
  exam_event_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    (
      select count(*)
      from public.child_syllabus_history history
      where history.syllabus_item_id = p_syllabus_item_id
    ) as history_count,
    (
      select count(*)
      from public.child_class_plans plan
      where plan.syllabus_item_ids @> array[p_syllabus_item_id]::uuid[]
    ) as class_plan_count,
    (
      select count(*)
      from public.exam_event_items exam_item
      where exam_item.child_syllabus_item_id = p_syllabus_item_id
    ) as exam_event_count;
$$;

create or replace function public.child_syllabus_content_usage(p_content_id uuid)
returns table (
  assignment_count bigint,
  history_count bigint,
  class_plan_count bigint,
  exam_event_count bigint
)
language sql
stable
set search_path = public
as $$
  with assignments as (
    select item.id
    from public.child_syllabus_items item
    where item.content_id = p_content_id
  )
  select
    (select count(*) from assignments) as assignment_count,
    (
      select count(*)
      from public.child_syllabus_history history
      where history.syllabus_item_id in (select id from assignments)
    ) as history_count,
    (
      select count(*)
      from public.child_class_plans plan
      where exists (
        select 1
        from assignments
        where plan.syllabus_item_ids @> array[assignments.id]::uuid[]
      )
    ) as class_plan_count,
    (
      select count(*)
      from public.exam_event_items exam_item
      where exam_item.child_syllabus_item_id in (select id from assignments)
    ) as exam_event_count;
$$;
