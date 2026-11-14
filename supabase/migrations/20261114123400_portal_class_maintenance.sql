begin;

create function public.maintain_dojo_class(
  p_slug text, p_id uuid, p_delete boolean, p_date date, p_name text,
  p_type text, p_responsible text, p_notes text
) returns uuid[] language plpgsql set search_path = '' as $$
declare
  old_date date;
  affected uuid[];
begin
  perform 1 from public.dojos where slug = p_slug and archived_at is null for share;
  if not found or p_slug = 'gainberri' then raise exception 'Dojo no disponible'; end if;
  select class_date into strict old_date from public.classes
    where id = p_id and dojo_slug = p_slug for update;
  select array(select distinct member_id from public.attendance_logs
    where class_id = p_id and member_id is not null) into affected;
  if p_delete then
    delete from public.member_technical_history where class_id = p_id;
    delete from public.dojo_technical_history where class_id = p_id;
    delete from public.member_technique_assignments where class_id = p_id;
    delete from public.classes where id = p_id and dojo_slug = p_slug;
  else
    update public.classes set class_date = p_date, name = p_name, class_type = p_type,
      responsible = p_responsible, notes = p_notes, updated_at = now() where id = p_id and dojo_slug = p_slug;
    if old_date <> p_date then
      update public.attendance_logs set attended_on = p_date where class_id = p_id;
      update public.provisional_attendance set attended_on = p_date where class_id = p_id;
      update public.technical_plans set class_date = p_date, updated_at = now() where class_id = p_id;
      update public.dojo_technical_history set class_date = p_date where class_id = p_id;
      update public.member_technical_history set class_date = p_date where class_id = p_id;
      update public.member_technique_assignments set assigned_on = p_date where class_id = p_id;
      update public.child_syllabus_history set practiced_on = p_date, updated_at = now() where class_id = p_id;
    end if;
  end if;
  return affected;
end;
$$;
revoke all on function public.maintain_dojo_class(text,uuid,boolean,date,text,text,text,text) from public,anon,authenticated;
grant execute on function public.maintain_dojo_class(text,uuid,boolean,date,text,text,text,text) to service_role;

commit;
