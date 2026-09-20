create table if not exists public.technical_area_materials (
  id uuid primary key default gen_random_uuid(),
  member_class text not null check (member_class in ('kids', 'adults', 'both')),
  grade text not null,
  title text not null,
  description text,
  material_type text not null default 'link' check (material_type in ('youtube', 'drive', 'document', 'playlist', 'link', 'site')),
  url text not null,
  section text not null default 'Material',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists technical_area_materials_lookup_idx
  on public.technical_area_materials (member_class, grade, active, sort_order);

alter table public.technical_area_materials enable row level security;
