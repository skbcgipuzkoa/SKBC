create table if not exists public.attendance_individual_work (
  attendance_id uuid primary key references public.attendance_logs(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  mode text not null check (mode in ('adjust','replace')),
  removed_ids uuid[] not null default '{}' check (cardinality(removed_ids) <= 500),
  added_ids uuid[] not null default '{}' check (cardinality(added_ids) <= 500),
  updated_at timestamptz not null default now()
);
create index if not exists attendance_individual_work_class_idx on public.attendance_individual_work(class_id);
alter table public.attendance_individual_work enable row level security;
revoke all on public.attendance_individual_work from anon, authenticated;
grant select, insert, update, delete on public.attendance_individual_work to service_role;

alter table public.classes add column if not exists individual_work_closing_until timestamptz;

create or replace function public.save_attendance_individual_work(
  p_attendance_id uuid, p_class_id uuid, p_mode text, p_removed_ids uuid[], p_added_ids uuid[]
) returns text language plpgsql set search_path = public as $$
declare
  v_class public.classes%rowtype;
begin
  select * into v_class from public.classes where id = p_class_id for update;
  if not found then return 'missing'; end if;
  if v_class.individual_work_closing_until > now() then return 'closing'; end if;
  if v_class.status = 'cancelled' or (v_class.closed and v_class.status is distinct from 'pending') then
    return 'closed';
  end if;
  if not exists (select 1 from public.attendance_logs where id = p_attendance_id and class_id = p_class_id) then
    return 'missing';
  end if;
  if p_mode = 'reset' then
    delete from public.attendance_individual_work where attendance_id = p_attendance_id and class_id = p_class_id;
  else
    insert into public.attendance_individual_work(attendance_id,class_id,mode,removed_ids,added_ids)
    values (p_attendance_id,p_class_id,p_mode,p_removed_ids,p_added_ids)
    on conflict (attendance_id) do update set mode = excluded.mode, removed_ids = excluded.removed_ids,
      added_ids = excluded.added_ids, updated_at = now();
  end if;
  return 'ok';
end;
$$;
revoke execute on function public.save_attendance_individual_work(uuid,uuid,text,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.save_attendance_individual_work(uuid,uuid,text,uuid[],uuid[]) to service_role;
