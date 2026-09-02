create table if not exists public.technical_area_links (
  id uuid primary key default gen_random_uuid(),
  member_class public.member_class not null,
  grade text not null,
  target_grade text,
  url text not null,
  label text not null default 'AREA TECNICA PERSONAL',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_class, grade)
);

alter table public.technical_area_links enable row level security;

insert into public.technical_area_links (member_class, grade, target_grade, url, label, active, notes)
select ranked.member_class, ranked.grade, ranked.target_grade, ranked.site_url, 'AREA TECNICA PERSONAL', true, 'Importado desde enlaces existentes de kenshis.'
from (
  select
    grouped.member_class,
    grouped.grade,
    case
      when grouped.member_class = 'adults' and upper(grouped.grade) = 'MINARAI' then '5 KYU'
      when grouped.member_class = 'adults' and upper(grouped.grade) = '5 KYU' then '4 KYU'
      when grouped.member_class = 'adults' and upper(grouped.grade) = '4 KYU' then '3 KYU'
      when grouped.member_class = 'adults' and upper(grouped.grade) = '3 KYU' then '2 KYU'
      when grouped.member_class = 'adults' and upper(grouped.grade) = '2 KYU' then '1 KYU'
      when grouped.member_class = 'adults' and upper(grouped.grade) = '1 KYU' then '1 DAN'
      when grouped.member_class = 'kids' and upper(grouped.grade) = 'MINARAI' then 'BLANCO-AMARILLO'
      when grouped.member_class = 'kids' and upper(grouped.grade) in ('BLANCO', 'BLANCO Y AMARILLO', 'BLANCO-AMARILLO') then '5 KYU'
      when grouped.member_class = 'kids' and upper(grouped.grade) in ('5 KYU', 'AMARILLO', 'AMARILLO Y NARANJA', 'AMARILLO-NARANJA') then '4 KYU'
      when grouped.member_class = 'kids' and upper(grouped.grade) in ('4 KYU', 'NARANJA', 'NARANJA Y VERDE', 'NARANJA-VERDE') then '3 KYU'
      when grouped.member_class = 'kids' and upper(grouped.grade) in ('3 KYU', 'VERDE', 'VERDE Y AZUL', 'VERDE-AZUL') then '2 KYU'
      when grouped.member_class = 'kids' and upper(grouped.grade) in ('2 KYU', 'AZUL', 'AZUL Y MARRON', 'AZUL-MARRON') then '1 KYU'
      when grouped.member_class = 'kids' and upper(grouped.grade) in ('1 KYU', 'MARRON') then '1 DAN'
      else null
    end as target_grade,
    grouped.site_url,
    row_number() over (
      partition by grouped.member_class, grouped.grade
      order by grouped.members desc, grouped.site_url
    ) as position
  from (
    select
      m.class as member_class,
      coalesce(nullif(trim(m.grade), ''), 'MINARAI') as grade,
      trim(m.site_url) as site_url,
      count(*) as members
    from public.members m
    where m.site_url is not null
      and trim(m.site_url) <> ''
    group by m.class, coalesce(nullif(trim(m.grade), ''), 'MINARAI'), trim(m.site_url)
  ) grouped
) ranked
where ranked.position = 1
on conflict (member_class, grade) do update
set
  target_grade = excluded.target_grade,
  url = excluded.url,
  active = excluded.active,
  updated_at = now();
