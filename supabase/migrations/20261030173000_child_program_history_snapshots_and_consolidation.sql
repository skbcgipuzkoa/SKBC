set local lock_timeout = '5s';

alter table public.child_syllabus_history
  add column if not exists title_snapshot text,
  add column if not exists category_snapshot text,
  add column if not exists description_snapshot text;

update public.child_syllabus_history history
set
  title_snapshot = assignment.title,
  category_snapshot = assignment.category,
  description_snapshot = assignment.description
from public.child_syllabus_items assignment
where assignment.id = history.syllabus_item_id
  and history.title_snapshot is null;

do $$
begin
  if not exists (
    select 1
    from public.child_syllabus_history
    where title_snapshot is null
  ) then
    alter table public.child_syllabus_history
      alter column title_snapshot set not null;
  end if;
end;
$$;

create or replace function public.snapshot_child_syllabus_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.title_snapshot is null then
    select assignment.title, assignment.category, assignment.description
    into new.title_snapshot, new.category_snapshot, new.description_snapshot
    from public.child_syllabus_items assignment
    where assignment.id = new.syllabus_item_id;
  end if;

  if new.title_snapshot is null then
    raise exception 'Child syllabus assignment % does not exist', new.syllabus_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists snapshot_child_syllabus_history_on_insert on public.child_syllabus_history;

create trigger snapshot_child_syllabus_history_on_insert
before insert on public.child_syllabus_history
for each row
execute function public.snapshot_child_syllabus_history();

create or replace function public.preserve_child_syllabus_history_snapshots()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.title_snapshot := old.title_snapshot;
  new.category_snapshot := old.category_snapshot;
  new.description_snapshot := old.description_snapshot;
  return new;
end;
$$;

drop trigger if exists preserve_child_syllabus_history_snapshots_on_update on public.child_syllabus_history;

create trigger preserve_child_syllabus_history_snapshots_on_update
before update on public.child_syllabus_history
for each row
execute function public.preserve_child_syllabus_history_snapshots();

-- Link only exact cross-grade matches. Any repeated normalized grade makes the
-- whole group ambiguous and leaves every content row untouched.
create temporary table _child_program_safe_consolidation (
  assignment_id uuid primary key,
  previous_content_id uuid not null,
  canonical_id uuid not null
) on commit drop;

insert into _child_program_safe_consolidation (assignment_id, previous_content_id, canonical_id)
with normalized_assignments as (
  select
    assignment.id as assignment_id,
    assignment.content_id,
    regexp_replace(translate(upper(trim(assignment.grade)), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '\s*(-|Y)\s*', '-', 'g') as normalized_grade,
    lower(regexp_replace(trim(content.title), '\s+', ' ', 'g')) as normalized_title,
    lower(trim(content.category)) as normalized_category,
    lower(regexp_replace(trim(coalesce(content.description, '')), '\s+', ' ', 'g')) as normalized_description
  from public.child_syllabus_items assignment
  join public.child_syllabus_contents content on content.id = assignment.content_id
), ambiguous_groups as (
  select normalized_title, normalized_category, normalized_description, normalized_grade
  from normalized_assignments
  group by normalized_title, normalized_category, normalized_description, normalized_grade
  having count(*) > 1
), safe_groups as (
  select
    normalized.normalized_title,
    normalized.normalized_category,
    normalized.normalized_description,
    min(normalized.content_id::text)::uuid as canonical_id
  from normalized_assignments normalized
  where not exists (
    select 1
    from ambiguous_groups ambiguous
    where ambiguous.normalized_title = normalized.normalized_title
      and ambiguous.normalized_category = normalized.normalized_category
      and ambiguous.normalized_description = normalized.normalized_description
  )
  group by normalized.normalized_title, normalized.normalized_category, normalized.normalized_description
  having count(distinct normalized.normalized_grade) > 1
), assignments_to_link as (
  select normalized.assignment_id, normalized.content_id as previous_content_id, safe_group.canonical_id
  from normalized_assignments normalized
  join safe_groups safe_group
    on safe_group.normalized_title = normalized.normalized_title
   and safe_group.normalized_category = normalized.normalized_category
   and safe_group.normalized_description = normalized.normalized_description
)
select assignment_id, previous_content_id, canonical_id
from assignments_to_link
where previous_content_id is distinct from canonical_id;

update public.child_syllabus_items assignment
set content_id = safe_group.canonical_id
from _child_program_safe_consolidation safe_group
where assignment.id = safe_group.assignment_id
  and assignment.content_id is distinct from safe_group.canonical_id;

delete from public.child_syllabus_contents content
where content.id in (
    select safe_group.previous_content_id
    from _child_program_safe_consolidation safe_group
  )
  and not exists (
    select 1
    from public.child_syllabus_items assignment
    where assignment.content_id = content.id
  );
