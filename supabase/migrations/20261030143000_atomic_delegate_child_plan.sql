create or replace function public.save_delegate_child_plan_if_open(
  p_class_id uuid,
  p_objective text,
  p_activities text[],
  p_syllabus_item_ids uuid[],
  p_notes text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.classes
  where id = p_class_id
    and class_group = 'kids'
    and closed = false
  for update;

  if not found then
    raise exception 'La clase infantil ya esta cerrada o no existe.';
  end if;

  insert into public.child_class_plans (
    class_id,
    objective,
    activities,
    syllabus_item_ids,
    notes,
    updated_at
  ) values (
    p_class_id,
    p_objective,
    coalesce(p_activities, '{}'::text[]),
    coalesce(p_syllabus_item_ids, '{}'::uuid[]),
    p_notes,
    now()
  )
  on conflict (class_id) do update set
    objective = excluded.objective,
    activities = excluded.activities,
    syllabus_item_ids = excluded.syllabus_item_ids,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.save_delegate_child_plan_if_open(uuid, text, text[], uuid[], text) from public;
grant execute on function public.save_delegate_child_plan_if_open(uuid, text, text[], uuid[], text) to service_role;
