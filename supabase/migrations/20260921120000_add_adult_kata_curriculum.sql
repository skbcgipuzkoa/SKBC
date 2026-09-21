with kata_rows(legacy_id, grade, name, content_type, program_order, summary_es) as (
  values
    ('KATA_TANEN_5KYU_TENCHIKEN_DAI_ICHI', '5 KYU', 'Tenchi ken dai ichi', 'KATA_TANEN', 901, 'Kata tan-en del programa de 5 KYU: Tenchi ken dai ichi. Trabajo individual de embusen, ritmo, kamae y precision tecnica.'),
    ('KATA_TANEN_5KYU_RYUO_KEN_DAI_ICHI', '5 KYU', 'Ryuo ken dai ichi', 'KATA_TANEN', 902, 'Kata tan-en del programa de 5 KYU: Ryuo ken dai ichi. Trabajo individual de la familia Ryuo ken, con atencion a desplazamiento y forma correcta.'),

    ('KATA_TANEN_4KYU_GIWA_KEN_DAI_ICHI', '4 KYU', 'Giwa ken dai ichi', 'KATA_TANEN', 901, 'Kata tan-en del programa de 4 KYU: Giwa ken dai ichi. Trabajo individual para fijar el embusen, el kamae y la continuidad de la forma.'),
    ('KATA_SOTAI_4KYU_TENCHI_KEN_DAI_ICHI', '4 KYU', 'Tenchi ken dai ichi', 'KATA_SOTAI', 951, 'Kata sotai del programa de 4 KYU: Tenchi ken dai ichi. Trabajo por parejas con distancia, timing y coordinacion entre atacante y defensor.'),
    ('KATA_SOTAI_4KYU_RYUO_KEN_DAI_ICHI', '4 KYU', 'Ryuo ken dai ichi', 'KATA_SOTAI', 952, 'Kata sotai del programa de 4 KYU: Ryuo ken dai ichi. Trabajo por parejas para aplicar la forma con maai, ritmo y control.'),

    ('KATA_TANEN_3KYU_TENCHI_KEN_DAI_NI', '3 KYU', 'Tenchi ken dai ni', 'KATA_TANEN', 901, 'Kata tan-en del programa de 3 KYU: Tenchi ken dai ni. Trabajo individual de continuidad, direccion y precision del hokei.'),

    ('KATA_TANEN_2KYU_TENCHI_KEN_DAI_SAN', '2 KYU', 'Tenchi ken dai san', 'KATA_TANEN', 901, 'Kata tan-en del programa de 2 KYU: Tenchi ken dai san. Trabajo individual de embusen, cambios de direccion y forma tecnica.'),
    ('KATA_TANEN_2KYU_TENCHI_KEN_DAI_YON', '2 KYU', 'Tenchi ken dai yon', 'KATA_TANEN', 902, 'Kata tan-en del programa de 2 KYU: Tenchi ken dai yon. Trabajo individual de forma, ritmo y precision en la secuencia.'),
    ('KATA_TANEN_2KYU_GIWA_KEN_DAI_NI', '2 KYU', 'Giwa ken dai ni', 'KATA_TANEN', 903, 'Kata tan-en del programa de 2 KYU: Giwa ken dai ni. Trabajo individual de la familia Giwa ken con control de postura y desplazamiento.'),
    ('KATA_SOTAI_2KYU_GIWA_KEN_DAI_ICHI', '2 KYU', 'Giwa ken dai ichi', 'KATA_SOTAI', 951, 'Kata sotai del programa de 2 KYU: Giwa ken dai ichi. Trabajo por parejas con distancia, timing y coordinacion tecnica.'),

    ('KATA_TANEN_1KYU_TENCHI_KEN_DAI_GO', '1 KYU', 'Tenchi ken dai go', 'KATA_TANEN', 901, 'Kata tan-en del programa de 1 KYU: Tenchi ken dai go. Trabajo individual de continuidad, embusen y control del cuerpo.'),
    ('KATA_TANEN_1KYU_TENCHI_KEN_DAI_ROKU', '1 KYU', 'Tenchi ken dai roku', 'KATA_TANEN', 902, 'Kata tan-en del programa de 1 KYU: Tenchi ken dai roku. Trabajo individual de forma completa, ritmo y precision.'),
    ('KATA_TANEN_1KYU_BYAKUREN_KEN_DAI_ICHI', '1 KYU', 'Byakuren ken dai ichi', 'KATA_TANEN', 903, 'Kata tan-en del programa de 1 KYU: Byakuren ken dai ichi. Trabajo individual de la familia Byakuren ken con postura, direccion y continuidad.'),
    ('KATA_SOTAI_1KYU_TENCHI_KEN_DAI_NI', '1 KYU', 'Tenchi ken dai ni', 'KATA_SOTAI', 951, 'Kata sotai del programa de 1 KYU: Tenchi ken dai ni. Trabajo por parejas de aplicacion, distancia y coordinacion.'),

    ('KATA_TANEN_1DAN_TENCHI_KEN_DAI_ICHI', '1 DAN', 'Tenchi ken dai ichi', 'KATA_TANEN', 901, 'Kata tan-en para 1 DAN: Tenchi ken dai ichi, trabajado a derecha e izquierda cuando corresponda.'),
    ('KATA_TANEN_1DAN_TENCHI_KEN_DAI_NI', '1 DAN', 'Tenchi ken dai ni', 'KATA_TANEN', 902, 'Kata tan-en para 1 DAN: Tenchi ken dai ni, trabajado a derecha e izquierda cuando corresponda.'),
    ('KATA_TANEN_1DAN_TENCHI_KEN_DAI_SAN', '1 DAN', 'Tenchi ken dai san', 'KATA_TANEN', 903, 'Kata tan-en para 1 DAN: Tenchi ken dai san, trabajado a derecha e izquierda cuando corresponda.'),
    ('KATA_TANEN_1DAN_TENCHI_KEN_DAI_YON', '1 DAN', 'Tenchi ken dai yon', 'KATA_TANEN', 904, 'Kata tan-en para 1 DAN: Tenchi ken dai yon, trabajado a derecha e izquierda cuando corresponda.'),
    ('KATA_TANEN_1DAN_TENCHI_KEN_DAI_GO', '1 DAN', 'Tenchi ken dai go', 'KATA_TANEN', 905, 'Kata tan-en para 1 DAN: Tenchi ken dai go, trabajado a derecha e izquierda cuando corresponda.'),
    ('KATA_TANEN_1DAN_TENCHI_KEN_DAI_ROKU', '1 DAN', 'Tenchi ken dai roku', 'KATA_TANEN', 906, 'Kata tan-en para 1 DAN: Tenchi ken dai roku, trabajado a derecha e izquierda cuando corresponda.'),
    ('KATA_TANEN_1DAN_GIWA_KEN_DAI_ICHI', '1 DAN', 'Giwa ken dai ichi', 'KATA_TANEN', 907, 'Kata tan-en para 1 DAN: Giwa ken dai ichi.'),
    ('KATA_TANEN_1DAN_GIWA_KEN_DAI_NI', '1 DAN', 'Giwa ken dai ni', 'KATA_TANEN', 908, 'Kata tan-en para 1 DAN: Giwa ken dai ni.'),
    ('KATA_TANEN_1DAN_BYAKUREN_KEN_DAI_ICHI', '1 DAN', 'Byakuren ken dai ichi', 'KATA_TANEN', 909, 'Kata tan-en para 1 DAN: Byakuren ken dai ichi.'),
    ('KATA_TANEN_1DAN_KO_MANJI_KEN', '1 DAN', 'Ko manji ken', 'KATA_TANEN', 910, 'Kata tan-en para 1 DAN: Ko manji ken.'),
    ('KATA_SOTAI_1DAN_GIWA_KEN_DAI_ICHI', '1 DAN', 'Giwa ken dai ichi', 'KATA_SOTAI', 951, 'Kata sotai para 1 DAN: Giwa ken dai ichi. Trabajo por parejas con maai, timing y control.'),
    ('KATA_SOTAI_1DAN_TENCHI_KEN_DAI_NI', '1 DAN', 'Tenchi ken dai ni', 'KATA_SOTAI', 952, 'Kata sotai para 1 DAN: Tenchi ken dai ni. Trabajo por parejas con aplicacion tecnica y coordinacion.'),

    ('KATA_TANEN_3DAN_KO_MANJI_KEN', '3 DAN', 'Ko manji ken', 'KATA_TANEN', 901, 'Kata tan-en para 3 DAN: Ko manji ken, incluyendo las secciones indicadas en el programa de dan.'),

    ('KATA_SHAKUJO_5DAN_TANEN', '5 DAN', 'Shakujo tan-en', 'KATA_TANEN', 901, 'Kata tan-en de Shakujo para grados altos. Trabajo individual de forma, precision y manejo del baston.'),
    ('KATA_SHAKUJO_5DAN_SOTAI', '5 DAN', 'Shakujo sotai', 'KATA_SOTAI', 951, 'Kata sotai de Shakujo para grados altos. Trabajo por parejas de distancia, control y aplicacion.')
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
  kata.legacy_id,
  kata.grade,
  kata.name,
  kata.name,
  'hokei'::public.technique_category,
  kata.content_type,
  kata.program_order,
  case kata.grade
    when 'MINARAI' then 1
    when '5 KYU' then 2
    when '4 KYU' then 3
    when '3 KYU' then 4
    when '2 KYU' then 5
    when '1 KYU' then 6
    when '1 DAN' then 7
    when '2 DAN' then 8
    when '3 DAN' then 9
    when '4 DAN' then 10
    when '5 DAN' then 11
    else null
  end,
  true,
  false,
  false,
  0,
  kata.summary_es,
  now(),
  'Syllabus BSKF 2024',
  now()
from kata_rows kata
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
