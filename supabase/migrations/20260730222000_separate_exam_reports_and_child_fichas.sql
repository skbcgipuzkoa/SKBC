update public.exams
set
  report_url = null,
  report_created_at = null,
  report_created_by = null,
  report_type = null,
  report_file_name = null
where report_url is not null
  and diploma_url is not null
  and report_url = diploma_url
  and coalesce(report_type, '') ilike 'Diploma';

update public.members
set
  ficha_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  updated_at = now()
where class = 'kids'
  and ficha_token is null;
