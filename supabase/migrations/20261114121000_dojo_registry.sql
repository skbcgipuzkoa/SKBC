create table public.dojos (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 100),
  accent_color text not null check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  archived_at timestamptz
);

create table public.dojo_groups (
  dojo_slug text not null references public.dojos(slug),
  member_class public.member_class not null,
  primary key (dojo_slug, member_class)
);

create table public.dojo_memberships (
  member_id uuid not null references public.members(id),
  dojo_slug text not null references public.dojos(slug),
  status public.member_status not null default 'active',
  validated_at timestamptz,
  primary key (member_id, dojo_slug)
);

create index dojo_memberships_dojo_status_idx on public.dojo_memberships (dojo_slug, status);

create table public.dojo_senseis (
  user_id uuid not null references auth.users(id) on delete cascade,
  dojo_slug text not null references public.dojos(slug),
  primary key (user_id, dojo_slug)
);

alter table public.classes add column dojo_slug text not null default 'gainberri';
alter table public.dojos enable row level security;
alter table public.dojo_groups enable row level security;
alter table public.dojo_memberships enable row level security;
alter table public.dojo_senseis enable row level security;
revoke all on public.dojos, public.dojo_groups, public.dojo_memberships, public.dojo_senseis from anon, authenticated;
