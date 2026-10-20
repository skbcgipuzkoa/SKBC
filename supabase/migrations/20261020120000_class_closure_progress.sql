create table if not exists public.class_closure_progress (
  id uuid primary key,
  class_id uuid references public.classes(id) on delete cascade,
  current_step text not null default 'attendance',
  completed_steps text[] not null default '{}',
  status text not null default 'running' check (status in ('running', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists class_closure_progress_expires_idx
  on public.class_closure_progress(expires_at);

alter table public.class_closure_progress enable row level security;
