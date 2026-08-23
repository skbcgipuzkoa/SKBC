alter table public.courses
  add column if not exists competition_category text,
  add column if not exists competition_result text,
  add column if not exists competition_medal text,
  add column if not exists competition_notes text;

create index if not exists courses_taikai_results_idx
  on public.courses(kind, course_date desc)
  where kind = 'taikai';
