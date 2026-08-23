update public.legacy_sheet_sync_jobs
set
  status = 'skipped',
  error_message = null,
  completed_at = coalesce(completed_at, now()),
  updated_at = now()
where target_sheet = 'TAIKAI'
  and event_type = 'course.created'
  and status in ('pending', 'running', 'failed');
