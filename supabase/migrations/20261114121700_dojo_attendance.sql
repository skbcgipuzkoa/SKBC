create function public.save_dojo_attendance(p_slug text, p_class uuid, p_members uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  session public.classes%rowtype;
begin
  perform 1 from public.dojos where slug = p_slug and archived_at is null for share;
  if not found or p_slug = 'gainberri' then
    raise exception 'El dojo no permite esta operación';
  end if;
  select * into session from public.classes
    where id = p_class and dojo_slug = p_slug and status = 'pending' and not closed
    for update;
  if not found then
    raise exception 'La clase no está disponible';
  end if;
  lock table public.dojo_memberships in share mode;
  if exists (
    select 1 from unnest(p_members) as selected(id)
    where not exists (
      select 1 from public.dojo_memberships dm join public.members m on m.id = dm.member_id
      where dm.member_id = selected.id and dm.dojo_slug = p_slug
        and dm.status = 'active' and m.class = session.class_group
    )
  ) then
    raise exception 'La lista contiene una inscripción no disponible';
  end if;
  delete from public.attendance_logs where class_id = p_class and not (member_id = any(p_members));
  insert into public.attendance_logs (class_id, member_id, attended_on, official_grade, trained_grade)
  select p_class, m.id, session.class_date, m.grade, m.grade from public.members m
  where m.id = any(p_members) and not exists (
    select 1 from public.attendance_logs a where a.class_id = p_class and a.member_id = m.id
  );
end;
$$;
revoke all on function public.save_dojo_attendance(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.save_dojo_attendance(text, uuid, uuid[]) to service_role;
