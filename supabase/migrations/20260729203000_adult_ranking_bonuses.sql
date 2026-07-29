create table if not exists public.adult_ranking_bonuses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  bonus_date date not null default current_date,
  points integer not null,
  reason text not null,
  created_by text not null default 'WEB SKBC',
  created_at timestamptz not null default now()
);

create index if not exists adult_ranking_bonuses_member_idx on public.adult_ranking_bonuses (member_id, bonus_date desc);

alter table public.adult_ranking_bonuses enable row level security;
