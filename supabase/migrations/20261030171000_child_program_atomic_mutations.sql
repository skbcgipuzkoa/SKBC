set local lock_timeout = '5s';

create or replace function public.remove_child_syllabus_assignment_if_unused(
  p_syllabus_item_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_content_id uuid;
begin
  select item.content_id
  into v_content_id
  from public.child_syllabus_items item
  where item.id = p_syllabus_item_id;

  if v_content_id is null then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_ASSIGNMENT_NOT_FOUND';
  end if;

  perform 1
  from public.child_syllabus_contents content
  where content.id = v_content_id
  for update;

  perform 1
  from public.child_syllabus_items item
  where item.id = p_syllabus_item_id
    and item.content_id = v_content_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_ASSIGNMENT_NOT_FOUND';
  end if;

  -- Plans store UUIDs in an array without an FK, so block concurrent plan writes
  -- while the usage predicate and delete execute in this transaction.
  lock table public.child_class_plans in share row exclusive mode;

  if exists (
    select 1
    from public.child_syllabus_history history
    where history.syllabus_item_id = p_syllabus_item_id
  ) or exists (
    select 1
    from public.child_class_plans plan
    where plan.syllabus_item_ids @> array[p_syllabus_item_id]::uuid[]
  ) or exists (
    select 1
    from public.exam_event_items exam_item
    where exam_item.child_syllabus_item_id = p_syllabus_item_id
  ) then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_ASSIGNMENT_IN_USE';
  end if;

  delete from public.child_syllabus_items
  where id = p_syllabus_item_id;

  return 'deleted';
end;
$$;

create or replace function public.delete_unused_child_syllabus_content(
  p_content_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment_ids uuid[];
begin
  perform 1
  from public.child_syllabus_contents content
  where content.id = p_content_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_CONTENT_NOT_FOUND';
  end if;

  perform 1
  from public.child_syllabus_items item
  where item.content_id = p_content_id
  order by item.id
  for update;

  select coalesce(array_agg(item.id order by item.id), '{}'::uuid[])
  into v_assignment_ids
  from public.child_syllabus_items item
  where item.content_id = p_content_id;

  lock table public.child_class_plans in share row exclusive mode;

  if exists (
    select 1
    from public.child_syllabus_history history
    where history.syllabus_item_id = any(v_assignment_ids)
  ) or exists (
    select 1
    from public.child_class_plans plan
    where plan.syllabus_item_ids && v_assignment_ids
  ) or exists (
    select 1
    from public.exam_event_items exam_item
    where exam_item.child_syllabus_item_id = any(v_assignment_ids)
  ) then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_CONTENT_IN_USE';
  end if;

  delete from public.child_syllabus_items
  where content_id = p_content_id;

  delete from public.child_syllabus_contents
  where id = p_content_id;

  return 'deleted';
end;
$$;

revoke execute on function public.remove_child_syllabus_assignment_if_unused(uuid) from public, anon, authenticated;
revoke execute on function public.delete_unused_child_syllabus_content(uuid) from public, anon, authenticated;

grant execute on function public.remove_child_syllabus_assignment_if_unused(uuid) to service_role;
grant execute on function public.delete_unused_child_syllabus_content(uuid) to service_role;
