create table if not exists public.family_units (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_unit_members (
  family_unit_id uuid not null references public.family_units(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (family_unit_id, member_id),
  unique (member_id)
);

create table if not exists public.family_billing_sheet_tasks (
  id uuid primary key default gen_random_uuid(),
  family_unit_id uuid references public.family_units(id) on delete cascade,
  subject_member_id uuid not null references public.members(id) on delete cascade,
  composition_signature text not null,
  status text not null default 'pending' check (status in ('pending', 'generated', 'delivered')),
  billing_on date,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_member_id, composition_signature)
);

create index if not exists family_unit_members_family_idx on public.family_unit_members(family_unit_id);
create index if not exists family_billing_tasks_active_idx on public.family_billing_sheet_tasks(status, billing_on);
create index if not exists family_billing_tasks_family_idx on public.family_billing_sheet_tasks(family_unit_id, created_at desc);

alter table public.family_units enable row level security;
alter table public.family_unit_members enable row level security;
alter table public.family_billing_sheet_tasks enable row level security;

create or replace function public.touch_family_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.family_units
  set updated_at = now()
  where id = coalesce(new.family_unit_id, old.family_unit_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists family_unit_members_touch_unit on public.family_unit_members;
create trigger family_unit_members_touch_unit
after insert or update or delete on public.family_unit_members
for each row execute function public.touch_family_unit();
