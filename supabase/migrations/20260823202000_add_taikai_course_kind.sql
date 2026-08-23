alter table public.courses
  drop constraint if exists courses_kind_check;

alter table public.courses
  add constraint courses_kind_check
  check (kind in ('national', 'international', 'taikai'));
