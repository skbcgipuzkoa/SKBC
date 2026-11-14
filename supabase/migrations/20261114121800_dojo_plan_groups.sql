create function public.prepare_dojo_plan_groups(p_slug text, p_class uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.classes c join public.dojos d on d.slug = c.dojo_slug
    where c.id = p_class and c.dojo_slug = p_slug and c.class_group = 'adults'
      and c.status = 'pending' and not c.closed and d.archived_at is null
    for update of c;
  if not found or p_slug = 'gainberri' then
    raise exception 'La clase no permite preparar un plan';
  end if;
  insert into public.class_technical_groups (class_id, grade)
  select distinct p_class, m.grade
  from public.dojo_memberships dm join public.members m on m.id = dm.member_id
  where dm.dojo_slug = p_slug and dm.status = 'active' and m.class = 'adults'
    and nullif(trim(m.grade), '') is not null
    and not exists (
      select 1 from public.class_technical_groups g where g.class_id = p_class and g.grade = m.grade
    );
end;
$$;
revoke all on function public.prepare_dojo_plan_groups(text, uuid) from public, anon, authenticated;
grant execute on function public.prepare_dojo_plan_groups(text, uuid) to service_role;
