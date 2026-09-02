create index if not exists member_technical_history_member_technique_idx
  on public.member_technical_history (member_id, technique_id);

with grade_order(grade, ord) as (
  values
    ('MINARAI', 1),
    ('5 KYU', 2),
    ('4 KYU', 3),
    ('3 KYU', 4),
    ('2 KYU', 5),
    ('1 KYU', 6),
    ('1 DAN', 7),
    ('2 DAN', 8),
    ('3 DAN', 9),
    ('4 DAN', 10),
    ('5 DAN', 11),
    ('6 DAN', 12),
    ('7 DAN', 13),
    ('8 DAN', 14),
    ('9 DAN', 15)
),
eligible_members as (
  select m.id, m.legacy_id, m.grade, member_grade.ord as member_ord
  from public.members m
  join grade_order member_grade on member_grade.grade = upper(trim(m.grade))
  where m.class = 'adults'
    and m.status = 'active'
    and upper(trim(m.grade)) <> 'MINARAI'
),
eligible_techniques as (
  select t.id, t.name, t.grade, t.category, t.content_type, technique_grade.ord as technique_ord
  from public.techniques t
  join grade_order technique_grade on technique_grade.grade = upper(trim(t.grade))
  where t.active = true
    and t.active_in_planning = true
),
seed_rows as (
  select
    m.id as member_id,
    m.legacy_id as member_legacy_id,
    m.grade as member_grade,
    t.id as technique_id,
    t.name as technique_name,
    t.grade as technique_grade,
    t.category,
    t.content_type,
    repetition.n as repetition
  from eligible_members m
  join eligible_techniques t on t.technique_ord < m.member_ord
  cross join generate_series(1, 3) as repetition(n)
)
insert into public.member_technical_history (
  legacy_id,
  class_date,
  member_id,
  member_grade_at_time,
  group_grade,
  target_grade,
  technique_id,
  technique_name,
  technique_grade,
  category,
  content_type,
  proposal_type,
  completed,
  counts_as_progression,
  counts_as_review,
  counts_for_stats,
  notes,
  created_by
)
select
  'HIA_SEED_' || coalesce(seed.member_legacy_id, seed.member_id::text) || '_' || seed.technique_id::text || '_' || seed.repetition::text,
  current_date,
  seed.member_id,
  seed.member_grade,
  seed.technique_grade,
  seed.technique_grade,
  seed.technique_id,
  seed.technique_name,
  seed.technique_grade,
  seed.category,
  seed.content_type,
  'HISTORIAL_INICIAL',
  true,
  false,
  true,
  true,
  'Historial tecnico inicial estimado por grados anteriores ya superados.',
  'system_initial_history'
from seed_rows seed
where not exists (
  select 1
  from public.member_technical_history history
  where history.legacy_id = 'HIA_SEED_' || coalesce(seed.member_legacy_id, seed.member_id::text) || '_' || seed.technique_id::text || '_' || seed.repetition::text
);
