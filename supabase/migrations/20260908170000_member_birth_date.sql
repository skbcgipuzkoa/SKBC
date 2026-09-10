alter table public.members
  add column if not exists birth_date date;

create index if not exists members_birth_date_idx
  on public.members (birth_date);
