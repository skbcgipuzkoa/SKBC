alter table public.adult_ranking_bonuses
  alter column permanent set default false;

update public.adult_ranking_bonuses
set permanent = false
where created_by like 'WEB SKBC:%'
   or lower(reason) like '%ensenando en clase%'
   or lower(reason) like '%enseñando en clase%'
   or lower(reason) like '%tatami%'
   or lower(reason) like '%apoyo a ninos%'
   or lower(reason) like '%apoyo a niños%';

create index if not exists adult_ranking_bonuses_type_idx
  on public.adult_ranking_bonuses (permanent, active, bonus_date desc);
