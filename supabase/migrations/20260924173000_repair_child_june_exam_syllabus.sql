-- Repair the child syllabus imported from the June 2026 progressive exam.
-- The legacy exam export used adult-like grade labels (5 KYU, 4 KYU...)
-- as source buckets. The child program must be stored under the real child
-- target grades so class plans, child fichas and integrated exams all read
-- from the same place.

delete from public.child_syllabus_items
where created_by = 'EXAMEN NINOS PROGRESIVO-JUNIO-2026';

with stage_map(target_grade, source_grade, stage_offset) as (
  values
    ('BLANCO-AMARILLO', '5 KYU', 1000),
    ('AMARILLO', '5 KYU', 2000),
    ('AMARILLO-NARANJA', '4 KYU', 3000),
    ('NARANJA', '4 KYU', 4000),
    ('NARANJA-VERDE', '3 KYU', 5000),
    ('VERDE', '3 KYU', 6000),
    ('VERDE-AZUL', '2 KYU', 7000),
    ('AZUL', '2 KYU', 8000),
    ('AZUL-MARRON', '1 KYU', 9000),
    ('MARRON', '1 KYU', 10000)
),
source_items as (
  select distinct on (stage_map.target_grade, lower(trim(child_syllabus_items.title)), lower(trim(child_syllabus_items.category)))
    gen_random_uuid() as id,
    stage_map.target_grade as grade,
    child_syllabus_items.title,
    child_syllabus_items.category,
    coalesce(child_syllabus_items.description, 'Copiado del examen progresivo infantil antiguo.') as description,
    true as exam_relevant,
    true as active,
    stage_map.stage_offset + coalesce(child_syllabus_items.sort_order, 100) as sort_order
  from stage_map
  join public.child_syllabus_items
    on upper(trim(child_syllabus_items.grade)) = stage_map.source_grade
  where child_syllabus_items.created_by = 'LEGACY EXAMENES'
  order by
    stage_map.target_grade,
    lower(trim(child_syllabus_items.title)),
    lower(trim(child_syllabus_items.category)),
    child_syllabus_items.active desc,
    child_syllabus_items.sort_order asc
)
insert into public.child_syllabus_items (
  id,
  grade,
  title,
  category,
  description,
  exam_relevant,
  active,
  sort_order,
  created_by,
  updated_by
)
select
  id,
  grade,
  title,
  category,
  description,
  exam_relevant,
  active,
  sort_order,
  'EXAMEN NINOS PROGRESIVO-JUNIO-2026',
  'Reparacion SKBC septiembre 2026'
from source_items;

update public.child_syllabus_items
set
  active = false,
  updated_by = 'Reparacion SKBC septiembre 2026',
  updated_at = now()
where created_by = 'LEGACY EXAMENES'
  and upper(trim(grade)) in ('5 KYU', '4 KYU', '3 KYU', '2 KYU', '1 KYU');
