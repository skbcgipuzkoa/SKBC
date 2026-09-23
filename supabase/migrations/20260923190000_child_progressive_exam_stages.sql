-- Temario infantil progresivo editable por grado objetivo.
-- Origen funcional: EXAMEN NINOS PROGRESIVO-JUNIO-2026 del sistema antiguo.
-- La semilla anterior copiaba el kamoku por bloques kyu; esta migracion lo deja
-- preparado en las etapas reales infantiles para examenes progresivos.

delete from public.child_syllabus_items
where created_by = 'EXAMEN NINOS PROGRESIVO-JUNIO-2026';

with stage_map(target_grade, source_grade, stage_offset) as (
  values
    ('BLANCO-AMARILLO', '5 KYU', 0),
    ('5 KYU', '5 KYU', 1000),
    ('AMARILLO-NARANJA', '4 KYU', 2000),
    ('4 KYU', '4 KYU', 3000),
    ('NARANJA-VERDE', '3 KYU', 4000),
    ('3 KYU', '3 KYU', 5000),
    ('VERDE-AZUL', '2 KYU', 6000),
    ('2 KYU', '2 KYU', 7000),
    ('AZUL-MARRON', '1 KYU', 8000),
    ('1 KYU', '1 KYU', 9000)
),
source_items as (
  select
    stage_map.target_grade,
    stage_map.stage_offset,
    child_syllabus_items.title,
    child_syllabus_items.category,
    child_syllabus_items.description,
    child_syllabus_items.exam_relevant,
    child_syllabus_items.sort_order
  from stage_map
  join public.child_syllabus_items
    on upper(coalesce(child_syllabus_items.grade, '')) = stage_map.source_grade
  where child_syllabus_items.created_by = 'LEGACY EXAMENES'
    and child_syllabus_items.active = true
)
insert into public.child_syllabus_items (
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
  source_items.target_grade,
  source_items.title,
  source_items.category,
  concat(
    coalesce(source_items.description, ''),
    E'\n\nBase: EXAMEN NINOS PROGRESIVO-JUNIO-2026.'
  ),
  coalesce(source_items.exam_relevant, true),
  true,
  source_items.stage_offset + coalesce(source_items.sort_order, 100),
  'EXAMEN NINOS PROGRESIVO-JUNIO-2026',
  'Migracion SKBC'
from source_items
order by source_items.stage_offset, source_items.sort_order, source_items.title;

update public.child_syllabus_items
set
  active = false,
  updated_by = 'Migracion EXAMEN NINOS PROGRESIVO-JUNIO-2026',
  updated_at = now()
where created_by = 'LEGACY EXAMENES'
  and exists (
    select 1
    from public.child_syllabus_items seeded
    where seeded.created_by = 'EXAMEN NINOS PROGRESIVO-JUNIO-2026'
  );
