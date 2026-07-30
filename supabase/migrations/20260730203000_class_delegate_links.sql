create table if not exists public.class_delegate_links (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  token text not null unique,
  delegate_name text,
  expires_at timestamptz not null,
  started_at timestamptz,
  closed_at timestamptz,
  revoked_at timestamptz,
  created_by text not null default 'WEB SKBC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.class_delegate_links enable row level security;

create index if not exists class_delegate_links_class_id_idx on public.class_delegate_links(class_id);
create index if not exists class_delegate_links_token_idx on public.class_delegate_links(token);
