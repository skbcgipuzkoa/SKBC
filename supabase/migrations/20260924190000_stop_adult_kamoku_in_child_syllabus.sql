-- The child syllabus must not be auto-filled from the adult kamoku.
-- A previous repair copied LEGACY EXAMENES rows from adult-like buckets
-- (5 KYU, 4 KYU, 3 KYU...) into child target grades. Keep manual child
-- syllabus entries intact, but deactivate the generated contaminated copy.

update public.child_syllabus_items
set
  active = false,
  updated_at = now(),
  updated_by = 'Correccion SKBC: no usar kamoku adulto en programa infantil'
where created_by = 'EXAMEN NINOS PROGRESIVO-JUNIO-2026';

update public.child_syllabus_items
set
  active = false,
  updated_at = now(),
  updated_by = 'Correccion SKBC: fuente adulta desactivada'
where created_by = 'LEGACY EXAMENES'
  and upper(trim(grade)) in ('MINARAI', '5 KYU', '4 KYU', '3 KYU', '2 KYU', '1 KYU');
