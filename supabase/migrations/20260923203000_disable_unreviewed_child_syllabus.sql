-- El programa infantil publico solo debe usar temario revisado.
-- El examen progresivo antiguo que tomamos como referencia llegaba de forma fiable
-- hasta 3 KYU infantil. Las etapas superiores quedan guardadas pero inactivas hasta
-- que el club las revise o las cree manualmente desde el administrador.

update public.child_syllabus_items
set
  active = false,
  updated_by = 'Migracion SKBC - pendiente revision infantil',
  updated_at = now()
where created_by in ('LEGACY EXAMENES', 'EXAMEN NINOS PROGRESIVO-JUNIO-2026')
  and upper(coalesce(grade, '')) in (
    'VERDE-AZUL',
    'AZUL',
    'AZUL-MARRON',
    'MARRON',
    '1 KYU',
    '1 DAN',
    '2 KYU'
  );
