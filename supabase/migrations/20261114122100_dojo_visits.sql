create table public.dojo_visits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  origin_slug text not null references public.dojos(slug),
  host_slug text not null references public.dojos(slug),
  starts_on date not null,
  ends_on date not null,
  check (origin_slug <> host_slug and starts_on <= ends_on),
  unique (member_id, origin_slug, host_slug, starts_on, ends_on)
);

alter table public.dojo_visits enable row level security;
revoke all on public.dojo_visits from public, anon, authenticated;
grant select, insert on public.dojo_visits to service_role;

alter table public.attendance_logs add column visit_id uuid references public.dojo_visits(id);
alter table public.member_technical_history add column progress_dojo_slug text references public.dojos(slug);

create function public.dojo_class_roster(p_slug text, p_class uuid)
returns table(member_id uuid, display_name text, visit_id uuid)
language sql stable set search_path = '' as $$
  select m.id, m.display_name::text, case when own.member_id is null then visit.id end
  from public.classes c
  join public.members m on m.class = c.class_group
  left join public.dojo_memberships own on own.member_id = m.id
    and own.dojo_slug = c.dojo_slug and own.status = 'active'
  left join lateral (
    select v.id from public.dojo_visits v
    join public.dojo_memberships origin on origin.member_id = v.member_id
      and origin.dojo_slug = v.origin_slug and origin.status = 'active'
    where v.member_id = m.id and v.host_slug = c.dojo_slug
      and c.class_date between v.starts_on and v.ends_on
    order by v.starts_on desc, v.id limit 1
  ) visit on true
  where c.id = p_class and c.dojo_slug = p_slug
    and (own.member_id is not null or visit.id is not null)
  order by m.display_name;
$$;
revoke all on function public.dojo_class_roster(text, uuid) from public, anon, authenticated;
grant execute on function public.dojo_class_roster(text, uuid) to service_role;

create or replace function public.save_dojo_attendance(p_slug text, p_class uuid, p_members uuid[])
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
      select 1 from public.dojo_class_roster(p_slug, p_class) r where r.member_id = selected.id
    )
  ) then
    raise exception 'La lista contiene una inscripción no disponible';
  end if;
  delete from public.attendance_logs where class_id = p_class and not (member_id = any(p_members));
  insert into public.attendance_logs (class_id, member_id, attended_on, official_grade, trained_grade, visit_id)
  select p_class, m.id, session.class_date, m.grade, m.grade, r.visit_id from public.members m
  join public.dojo_class_roster(p_slug, p_class) r on r.member_id = m.id
  where m.id = any(p_members) and not exists (
    select 1 from public.attendance_logs a where a.class_id = p_class and a.member_id = m.id
  );
end;
$$;
revoke all on function public.save_dojo_attendance(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.save_dojo_attendance(text, uuid, uuid[]) to service_role;

create or replace function public.finish_dojo_class(p_slug text, p_class uuid, p_worked uuid[])
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
    category, content_type, proposal_type, completed, counts_for_stats, created_by, progress_dojo_slug
  )
  select p.class_id, p.class_date, a.member_id, a.official_grade, p.technical_group_id,
    p.group_grade, p.target_grade, p.technique_id, p.technique_name, p.technique_grade,
    p.category, p.content_type, p.proposal_type, true, p.used_for_history, 'dojo_portal', coalesce(v.origin_slug, p_slug)
  from public.technical_plans p
  join public.attendance_logs a on a.class_id = p.class_id
    and upper(trim(coalesce(a.trained_grade, a.official_grade))) = upper(trim(p.group_grade))
  left join public.dojo_visits v on v.id = a.visit_id
  where p.class_id = p_class and p.completed and a.use_for_history;

  update public.classes set closed = true, status = 'completed', updated_at = now() where id = p_class;
end;
$$;
revoke all on function public.finish_dojo_class(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.finish_dojo_class(text, uuid, uuid[]) to service_role;
