create function public.add_class_visitors(p_host text, p_class uuid, p_origin text, p_members uuid[])
returns void language plpgsql set search_path = '' as $$
declare
  session public.classes%rowtype;
begin
  select * into session from public.classes
  where id = p_class and dojo_slug = p_host and status = 'pending' and not closed for update;
  if not found or p_origin = p_host or not exists (
    select 1 from public.dojos where slug = p_origin and archived_at is null
  ) then raise exception 'Clase o dojo no disponible'; end if;

  if exists (
    select 1 from unnest(p_members) selected(id)
    where not exists (
      select 1 from public.dojo_memberships dm join public.members m on m.id = dm.member_id
      where dm.member_id = selected.id and dm.dojo_slug = p_origin and dm.status = 'active'
        and m.class = session.class_group
    )
  ) then raise exception 'Kenshi no disponible'; end if;

  insert into public.dojo_visits(member_id, origin_slug, host_slug, starts_on, ends_on)
  select distinct selected.id, p_origin, p_host, session.class_date, session.class_date
  from unnest(p_members) selected(id)
  on conflict (member_id, origin_slug, host_slug, starts_on, ends_on) do nothing;

  insert into public.attendance_logs(class_id, member_id, attended_on, official_grade, trained_grade, visit_id)
  select p_class, m.id, session.class_date, m.grade, m.grade, v.id
  from public.members m join public.dojo_visits v on v.member_id = m.id
  where m.id = any(p_members) and v.origin_slug = p_origin and v.host_slug = p_host
    and v.starts_on = session.class_date and v.ends_on = session.class_date
    and not exists (select 1 from public.attendance_logs a where a.class_id = p_class and a.member_id = m.id);
end;
$$;
revoke all on function public.add_class_visitors(text,uuid,text,uuid[]) from public, anon, authenticated;
grant execute on function public.add_class_visitors(text,uuid,text,uuid[]) to service_role;
