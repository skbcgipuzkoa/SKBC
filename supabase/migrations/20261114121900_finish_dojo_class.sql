create function public.finish_dojo_class(p_slug text, p_class uuid, p_worked uuid[])
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.dojos where slug = p_slug and archived_at is null for share;
  if not found or p_slug = 'gainberri' then raise exception 'Dojo no disponible'; end if;
  perform 1 from public.classes where id = p_class and dojo_slug = p_slug
    and status = 'pending' and not closed for update;
  if not found then raise exception 'Clase no disponible'; end if;
  if exists (
    select 1 from unnest(p_worked) selected(id)
    where not exists (select 1 from public.technical_plans p where p.id = selected.id and p.class_id = p_class)
  ) then raise exception 'Técnica ajena a la clase'; end if;

  update public.technical_plans set completed = id = any(p_worked), updated_at = now()
    where class_id = p_class;
  insert into public.member_technical_history (
    class_id, class_date, member_id, member_grade_at_time, technical_group_id,
    group_grade, target_grade, technique_id, technique_name, technique_grade,
    category, content_type, proposal_type, completed, counts_for_stats, created_by
  )
  select p.class_id, p.class_date, a.member_id, a.official_grade, p.technical_group_id,
    p.group_grade, p.target_grade, p.technique_id, p.technique_name, p.technique_grade,
    p.category, p.content_type, p.proposal_type, true, p.used_for_history, 'dojo_portal'
  from public.technical_plans p
  join public.attendance_logs a on a.class_id = p.class_id
    and upper(trim(coalesce(a.trained_grade, a.official_grade))) = upper(trim(p.group_grade))
  where p.class_id = p_class and p.completed and a.use_for_history;

  update public.classes set closed = true, status = 'completed', updated_at = now() where id = p_class;
end;
$$;
revoke all on function public.finish_dojo_class(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.finish_dojo_class(text, uuid, uuid[]) to service_role;
