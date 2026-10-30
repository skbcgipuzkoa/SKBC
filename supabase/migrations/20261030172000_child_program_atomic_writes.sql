set local lock_timeout = '5s';

create or replace function public.normalize_child_program_grade(p_grade text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  with cleaned as (
    select regexp_replace(
      translate(upper(trim(p_grade)), 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑº°', 'AAAAEEEEIIIIOOOOUUUUN'),
      '[[:space:]]+',
      ' ',
      'g'
    ) as grade
  ), joined as (
    select regexp_replace(
      cleaned.grade,
      '([[:space:]]*-[[:space:]]*|[[:space:]]+Y[[:space:]]+)',
      '-',
      'g'
    ) as grade
    from cleaned
  )
  select case joined.grade
    when 'MINARAI' then 'BLANCO'
    when 'BLANCO AMARILLO' then 'BLANCO-AMARILLO'
    when 'AMARILLO NARANJA' then 'AMARILLO-NARANJA'
    when 'NARANJA VERDE' then 'NARANJA-VERDE'
    when 'VERDE AZUL' then 'VERDE-AZUL'
    when 'AZUL MARRON' then 'AZUL-MARRON'
    else joined.grade
  end
  from joined;
$$;

alter table public.child_syllabus_items
  add column if not exists active_before_archive boolean;

create unique index if not exists child_syllabus_items_content_normalized_grade_unique
  on public.child_syllabus_items (content_id, public.normalize_child_program_grade(grade));

create or replace function public.save_child_program_content(
  p_content_id uuid,
  p_title text,
  p_category text,
  p_description text,
  p_assignments jsonb,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_content_id uuid := p_content_id;
  v_archived_at timestamptz;
  v_assignment jsonb;
  v_assignment_id uuid;
  v_grade text;
  v_requested_grades text[] := '{}'::text[];
  v_sort_order integer;
  v_active boolean;
  v_exam_relevant boolean;
  v_omitted record;
begin
  if nullif(trim(p_title), '') is null
    or nullif(trim(p_category), '') is null
    or nullif(trim(p_actor), '') is null
    or jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_INVALID_PAYLOAD';
  end if;
  if jsonb_array_length(p_assignments) = 0 then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_INVALID_PAYLOAD';
  end if;

  for v_assignment in
    select payload.value
    from jsonb_array_elements(p_assignments) payload(value)
  loop
    v_grade := public.normalize_child_program_grade(v_assignment->>'grade');
    if nullif(v_grade, '') is null
      or jsonb_typeof(v_assignment->'active') is distinct from 'boolean'
      or jsonb_typeof(v_assignment->'examRelevant') is distinct from 'boolean'
      or jsonb_typeof(v_assignment->'sortOrder') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_INVALID_ASSIGNMENT';
    end if;
    if (v_assignment->>'sortOrder') !~ '^\d+$'
      or (v_assignment->>'sortOrder')::numeric > 100000 then
      raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_INVALID_ASSIGNMENT';
    end if;
    if not (v_grade = any(array[
      'BLANCO', 'BLANCO-AMARILLO', 'AMARILLO', 'AMARILLO-NARANJA',
      'NARANJA', 'NARANJA-VERDE', 'VERDE', 'VERDE-AZUL', 'AZUL',
      'AZUL-MARRON', 'MARRON', '1 DAN'
    ]::text[])) then
      raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_INVALID_GRADE';
    end if;
    if v_grade = any(v_requested_grades) then
      raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_DUPLICATE_GRADE';
    end if;
    v_requested_grades := array_append(v_requested_grades, v_grade);
  end loop;

  if v_content_id is null then
    insert into public.child_syllabus_contents (
      title, category, description, created_by, updated_by
    ) values (
      trim(p_title), lower(trim(p_category)), nullif(trim(p_description), ''), trim(p_actor), trim(p_actor)
    )
    returning id, archived_at into v_content_id, v_archived_at;
  else
    select content.archived_at
    into v_archived_at
    from public.child_syllabus_contents content
    where content.id = v_content_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_CONTENT_NOT_FOUND';
    end if;
  end if;

  -- Grade advisory locks serialize inserts (which have no row to lock yet) with reorders.
  for v_grade in
    select grades.grade
    from (
      select distinct public.normalize_child_program_grade(item.grade) as grade
      from public.child_syllabus_items item
      where item.content_id = v_content_id
      union
      select unnest(v_requested_grades)
    ) grades
    order by grades.grade
  loop
    perform pg_advisory_xact_lock(hashtextextended('child-program-grade:' || v_grade, 0));
  end loop;

  perform 1
  from public.child_syllabus_items item
  where item.content_id = v_content_id
  order by item.id
  for update;

  update public.child_syllabus_contents
  set
    title = trim(p_title),
    category = lower(trim(p_category)),
    description = nullif(trim(p_description), ''),
    updated_by = trim(p_actor),
    updated_at = now()
  where id = v_content_id;

  for v_assignment in
    select payload.value
    from jsonb_array_elements(p_assignments) payload(value)
    order by public.normalize_child_program_grade(payload.value->>'grade')
  loop
    v_grade := public.normalize_child_program_grade(v_assignment->>'grade');
    v_active := (v_assignment->>'active')::boolean;
    v_exam_relevant := (v_assignment->>'examRelevant')::boolean;
    v_sort_order := (v_assignment->>'sortOrder')::integer;

    select item.id
    into v_assignment_id
    from public.child_syllabus_items item
    where item.content_id = v_content_id
      and public.normalize_child_program_grade(item.grade) = v_grade;

    if found then
      update public.child_syllabus_items
      set
        grade = v_grade,
        active = case when v_archived_at is null then v_active else false end,
        active_before_archive = case when v_archived_at is null then null else v_active end,
        exam_relevant = v_exam_relevant,
        sort_order = v_sort_order,
        updated_by = trim(p_actor),
        updated_at = now()
      where id = v_assignment_id;
    else
      insert into public.child_syllabus_items (
        content_id, grade, title, category, description, active,
        active_before_archive, exam_relevant, sort_order, created_by, updated_by
      ) values (
        v_content_id, v_grade, trim(p_title), lower(trim(p_category)), nullif(trim(p_description), ''),
        case when v_archived_at is null then v_active else false end,
        case when v_archived_at is null then null else v_active end,
        v_exam_relevant, v_sort_order, trim(p_actor), trim(p_actor)
      );
    end if;
  end loop;

  -- Array-backed class plans have no FK, so prevent a concurrent plan write
  -- between each usage predicate and its delete.
  lock table public.child_class_plans in share row exclusive mode;

  for v_omitted in
    select item.id
    from public.child_syllabus_items item
    where item.content_id = v_content_id
      and not (public.normalize_child_program_grade(item.grade) = any(v_requested_grades))
    order by item.id
  loop
    if exists (
      select 1 from public.child_syllabus_history history
      where history.syllabus_item_id = v_omitted.id
    ) or exists (
      select 1 from public.child_class_plans plan
      where plan.syllabus_item_ids @> array[v_omitted.id]::uuid[]
    ) or exists (
      select 1 from public.exam_event_items exam_item
      where exam_item.child_syllabus_item_id = v_omitted.id
    ) then
      update public.child_syllabus_items
      set
        active = false,
        active_before_archive = case when v_archived_at is null then null else false end,
        updated_by = trim(p_actor),
        updated_at = now()
      where id = v_omitted.id;
    else
      delete from public.child_syllabus_items
      where id = v_omitted.id;
    end if;
  end loop;

  return v_content_id;
end;
$$;

create or replace function public.archive_child_syllabus_content(
  p_content_id uuid,
  p_actor text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_archived_at timestamptz;
begin
  select content.archived_at
  into v_archived_at
  from public.child_syllabus_contents content
  where content.id = p_content_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_CONTENT_NOT_FOUND';
  end if;
  if v_archived_at is not null then
    return 'already_archived';
  end if;

  perform 1
  from public.child_syllabus_items item
  where item.content_id = p_content_id
  order by item.id
  for update;

  update public.child_syllabus_items item
  set
    active_before_archive = item.active,
    active = false,
    updated_by = trim(p_actor),
    updated_at = now()
  where item.content_id = p_content_id;

  update public.child_syllabus_contents
  set archived_at = now(), updated_by = trim(p_actor), updated_at = now()
  where id = p_content_id;

  return 'archived';
end;
$$;

create or replace function public.restore_child_syllabus_content(
  p_content_id uuid,
  p_actor text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_archived_at timestamptz;
begin
  select content.archived_at
  into v_archived_at
  from public.child_syllabus_contents content
  where content.id = p_content_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_CONTENT_NOT_FOUND';
  end if;
  if v_archived_at is null then
    return 'already_active';
  end if;

  perform 1
  from public.child_syllabus_items item
  where item.content_id = p_content_id
  order by item.id
  for update;

  update public.child_syllabus_items item
  set
    active = coalesce(item.active_before_archive, false),
    active_before_archive = null,
    updated_by = trim(p_actor),
    updated_at = now()
  where item.content_id = p_content_id;

  update public.child_syllabus_contents
  set archived_at = null, updated_by = trim(p_actor), updated_at = now()
  where id = p_content_id;

  return 'restored';
end;
$$;

create or replace function public.move_child_program_assignment(
  p_assignment_id uuid,
  p_category text,
  p_direction text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_grade text;
  v_category text;
  v_grade_size integer;
  v_current_position integer;
  v_target_position integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_INVALID_DIRECTION';
  end if;

  v_category := lower(regexp_replace(trim(coalesce(p_category, '')), '[[:space:]]+', ' ', 'g'));
  if v_category = '' or char_length(v_category) > 80 then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_INVALID_CATEGORY';
  end if;

  select public.normalize_child_program_grade(item.grade)
  into v_grade
  from public.child_syllabus_items item
  where item.id = p_assignment_id;

  if v_grade is null then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_ASSIGNMENT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('child-program-category:' || v_grade || ':' || v_category, 0));

  perform 1
  from public.child_syllabus_items item
  where public.normalize_child_program_grade(item.grade) = v_grade
    and lower(regexp_replace(trim(item.category), '[[:space:]]+', ' ', 'g')) = v_category
  order by item.sort_order, item.title, item.id
  for update;

  if not exists (
    select 1 from public.child_syllabus_items item
    where item.id = p_assignment_id
      and public.normalize_child_program_grade(item.grade) = v_grade
      and lower(regexp_replace(trim(item.category), '[[:space:]]+', ' ', 'g')) = v_category
  ) then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_ASSIGNMENT_NOT_IN_CATEGORY';
  end if;

  select ordered.position
  into v_current_position
  from (
    select item.id, row_number() over (order by item.sort_order, item.title, item.id)::integer as position
    from public.child_syllabus_items item
    where public.normalize_child_program_grade(item.grade) = v_grade
      and lower(regexp_replace(trim(item.category), '[[:space:]]+', ' ', 'g')) = v_category
  ) ordered
  where ordered.id = p_assignment_id;

  v_target_position := v_current_position + case when p_direction = 'up' then -1 else 1 end;
  select count(*)::integer
  into v_grade_size
  from public.child_syllabus_items item
  where public.normalize_child_program_grade(item.grade) = v_grade
    and lower(regexp_replace(trim(item.category), '[[:space:]]+', ' ', 'g')) = v_category;

  if v_target_position < 1 or v_target_position > v_grade_size then
    raise exception using errcode = 'P0001', message = 'CHILD_PROGRAM_REORDER_TARGET_NOT_FOUND';
  end if;

  with ordered as (
    select item.id, row_number() over (order by item.sort_order, item.title, item.id)::integer as position
    from public.child_syllabus_items item
    where public.normalize_child_program_grade(item.grade) = v_grade
      and lower(regexp_replace(trim(item.category), '[[:space:]]+', ' ', 'g')) = v_category
  ), shifted as (
    select
      ordered.id,
      case
        when ordered.id = p_assignment_id then v_target_position
        when ordered.position = v_target_position then v_current_position
        else ordered.position
      end as desired_position
    from ordered
  ), reordered as (
    select shifted.id, row_number() over (order by shifted.desired_position, shifted.id)::integer * 10 as sort_order
    from shifted
  )
  update public.child_syllabus_items item
  set sort_order = reordered.sort_order
  from reordered
  where item.id = reordered.id;

  return 'moved';
end;
$$;

revoke execute on function public.save_child_program_content(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.archive_child_syllabus_content(uuid, text) from public, anon, authenticated;
revoke execute on function public.restore_child_syllabus_content(uuid, text) from public, anon, authenticated;
revoke execute on function public.move_child_program_assignment(uuid, text, text) from public, anon, authenticated;

grant execute on function public.save_child_program_content(uuid, text, text, text, jsonb, text) to service_role;
grant execute on function public.archive_child_syllabus_content(uuid, text) to service_role;
grant execute on function public.restore_child_syllabus_content(uuid, text) to service_role;
grant execute on function public.move_child_program_assignment(uuid, text, text) to service_role;
