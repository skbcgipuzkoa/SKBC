create table if not exists public.member_ficha_activity_sessions (
  id uuid primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0)
);
create table if not exists public.member_ficha_activity_events (
  id uuid primary key,
  session_id uuid not null references public.member_ficha_activity_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('time', 'video', 'technique', 'section')),
  section text not null check (length(section) between 1 and 60),
  resource_id text check (length(resource_id) <= 80),
  resource_label text check (length(resource_label) <= 180),
  active_seconds integer not null default 0 check (active_seconds between 0 and 15),
  created_at timestamptz not null default now(),
  check (kind = 'time' or active_seconds = 0)
);
create index if not exists ficha_activity_member_date_idx on public.member_ficha_activity_events(member_id, created_at desc);
create index if not exists ficha_activity_session_idx on public.member_ficha_activity_events(session_id);
create index if not exists ficha_activity_retention_idx on public.member_ficha_activity_sessions(started_at);
alter table public.member_ficha_activity_sessions enable row level security;
alter table public.member_ficha_activity_events enable row level security;
revoke all on public.member_ficha_activity_sessions, public.member_ficha_activity_events from public, anon, authenticated;
grant select, insert, update, delete on public.member_ficha_activity_sessions, public.member_ficha_activity_events to service_role;

create or replace function public.record_ficha_activity(p_member uuid, p_session uuid, p_events jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  session_row public.member_ficha_activity_sessions%rowtype;
  item jsonb;
  added_seconds integer := 0;
  inserted_seconds integer;
  wall_seconds integer;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 20 then
    raise exception 'Invalid activity batch';
  end if;
  if not exists (select 1 from public.members where id = p_member and status = 'active') then
    raise exception 'Inactive member';
  end if;
  insert into public.member_ficha_activity_sessions(id, member_id) values (p_session, p_member)
    on conflict (id) do nothing;
  select * into session_row from public.member_ficha_activity_sessions where id = p_session for update;
  if session_row.member_id <> p_member then raise exception 'Session owner mismatch'; end if;
  if (select count(*) from public.member_ficha_activity_events where member_id = p_member and created_at > now() - interval '1 minute') > 120 then
    raise exception 'Activity rate exceeded';
  end if;
  for item in select * from jsonb_array_elements(p_events) loop
    inserted_seconds := null;
    insert into public.member_ficha_activity_events(id, session_id, member_id, kind, section, resource_id, resource_label, active_seconds)
      values ((item->>'id')::uuid, p_session, p_member, item->>'kind', item->>'section',
        nullif(item->>'resourceId', ''), nullif(item->>'label', ''), coalesce((item->>'seconds')::integer, 0))
      on conflict (id) do nothing returning active_seconds into inserted_seconds;
    added_seconds := added_seconds + coalesce(inserted_seconds, 0);
  end loop;
  wall_seconds := greatest(0, floor(extract(epoch from (now() - session_row.started_at)))::integer) + 30;
  if session_row.active_seconds + added_seconds > wall_seconds then raise exception 'Impossible active duration'; end if;
  update public.member_ficha_activity_sessions set active_seconds = active_seconds + added_seconds, last_seen_at = now() where id = p_session;
  -- Cascading retention; never changes the pre-existing access counters.
  delete from public.member_ficha_activity_sessions where started_at < now() - interval '90 days';
end;
$$;
revoke all on function public.record_ficha_activity(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_ficha_activity(uuid, uuid, jsonb) to service_role;
comment on table public.member_ficha_activity_events is 'Uso aproximado de recursos de la ficha. Sin IP, ubicación, texto introducido ni URLs privadas. Retención 90 días.';
