alter table public.dojos
  add column internal_id bigint generated always as identity unique,
  add column training_schedule text;
