with ukemi_rows(legacy_id, grade, name, program_order, summary_es) as (
  values
    ('UKEMI_5KYU_DAISHARIN', '5 KYU', 'Daisharin', 801, 'Rodamiento lateral amplio para aprender a caer y recuperar la posicion con continuidad y control.'),
    ('UKEMI_5KYU_YOKO_UKEMI', '5 KYU', 'Yoko ukemi', 802, 'Caida lateral con proteccion del cuerpo, control del impacto y reincorporacion segura.'),
    ('UKEMI_4KYU_USHIRO_UKEMI', '4 KYU', 'Ushiro ukemi', 801, 'Caida hacia atras con control de la cabeza, la espalda y la absorcion del impacto.'),
    ('UKEMI_3KYU_MAE_UKEMI', '3 KYU', 'Mae ukemi', 801, 'Caida o rodamiento hacia delante manteniendo una trayectoria segura y una salida estable.'),
    ('UKEMI_2KYU_TOBI_KOMI_MAE_UKEMI', '2 KYU', 'Tobi komi mae ukemi (to clear obstacle)', 801, 'Ukemi hacia delante con salto para superar un obstaculo, manteniendo control y seguridad en la recepcion.'),
    ('UKEMI_1KYU_TOBI_UKEMI_GYAKU_GOTE', '1 KYU', 'Tobi ukemi from nage waza (gyaku gote)', 801, 'Ukemi con proyeccion desde nage waza, aplicado desde gyaku gote con control de la caida y de la recepcion.')
)
insert into public.techniques (
  legacy_id,
  grade,
  base_name,
  name,
  category,
  content_type,
  program_order,
  curriculum_order,
  active,
  active_in_planning,
  force_next,
  score,
  summary_es,
  summary_updated_at,
  summary_updated_by,
  updated_at
)
select
  ukemi.legacy_id,
  ukemi.grade,
  ukemi.name,
  ukemi.name,
  'ukemi'::public.technique_category,
  'UKEMI',
  ukemi.program_order,
  case ukemi.grade
    when 'MINARAI' then 1
    when '5 KYU' then 2
    when '4 KYU' then 3
    when '3 KYU' then 4
    when '2 KYU' then 5
    when '1 KYU' then 6
    else null
  end,
  true,
  false,
  false,
  0,
  ukemi.summary_es,
  now(),
  'Programa tecnico SKBC',
  now()
from ukemi_rows ukemi
on conflict (legacy_id) do update
set
  grade = excluded.grade,
  base_name = excluded.base_name,
  name = excluded.name,
  category = excluded.category,
  content_type = excluded.content_type,
  program_order = excluded.program_order,
  curriculum_order = excluded.curriculum_order,
  active = true,
  active_in_planning = false,
  summary_es = excluded.summary_es,
  summary_updated_at = excluded.summary_updated_at,
  summary_updated_by = excluded.summary_updated_by,
  updated_at = now();
