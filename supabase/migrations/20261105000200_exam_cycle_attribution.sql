create table if not exists public.member_exam_cycle_attributions (
  member_id uuid not null references public.members(id) on delete cascade,
  actual_exam_on date not null,
  call_month text not null check (call_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  is_retake boolean not null,
  reference_on date not null,
  source text not null check (length(trim(source)) > 0),
  created_at timestamptz not null default now(),
  primary key (member_id, actual_exam_on),
  check (reference_on <= actual_exam_on),
  check (not is_retake or reference_on = actual_exam_on)
);
alter table public.member_exam_cycle_attributions enable row level security;
revoke all on public.member_exam_cycle_attributions from anon, authenticated;
grant all on public.member_exam_cycle_attributions to service_role;

-- Explicit user confirmation: these two February exams were the December 2025 normal call.
-- Preserve members.last_exam_on and all academic/history dates.
insert into public.member_exam_cycle_attributions (member_id, actual_exam_on, call_month, is_retake, reference_on, source)
select id, date '2026-02-10', '2025-12', false, date '2025-12-01', 'user-confirmed normal December 2025 call; 2026-11-05'
from public.members
where legacy_id in ('5', '27') and last_exam_on = date '2026-02-10'
on conflict (member_id, actual_exam_on) do nothing;
