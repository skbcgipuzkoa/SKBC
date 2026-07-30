alter table public.adult_ranking_bonuses
  add column if not exists active boolean not null default true,
  add column if not exists permanent boolean not null default true,
  add column if not exists ended_at timestamptz;

create index if not exists adult_ranking_bonuses_active_idx
  on public.adult_ranking_bonuses (active, permanent, member_id);
