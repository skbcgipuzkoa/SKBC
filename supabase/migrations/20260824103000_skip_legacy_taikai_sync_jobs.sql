update public.legacy_sheet_sync_jobs
set
  status = 'completed',
  error_message = 'Omitido por diseño: Taikai vive solo en el sistema nuevo.',
  completed_at = coalesce(completed_at, now()),
  updated_at = now()
where target_sheet = 'TAIKAI'
  and event_type = 'course.created'
  and status in ('pending', 'running', 'failed');
