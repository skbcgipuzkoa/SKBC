with legacy_exam_rows as (
  select
    lr.row_number,
    lr.row_data,
    case
      when trim(coalesce(lr.row_data->>'FechaExamen', '')) ~ '^\d{4}-\d{2}-\d{2}' then left(trim(lr.row_data->>'FechaExamen'), 10)::date
      when trim(coalesce(lr.row_data->>'FechaExamen', '')) ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(trim(lr.row_data->>'FechaExamen'), 'DD/MM/YYYY')
      when trim(coalesce(lr.row_data->>'FechaExamen', '')) ~ '^\d{1,2}-\d{1,2}-\d{4}$' then to_date(trim(lr.row_data->>'FechaExamen'), 'DD-MM-YYYY')
      else null
    end as exam_date,
    regexp_replace(trim(coalesce(lr.row_data->>'ID', '')), '\.0+$', '') as legacy_member_id,
    nullif(trim(coalesce(lr.row_data->>'Grado', '')), '') as grade,
    nullif(trim(coalesce(lr.row_data->>'Examinador', '')), '') as examiner,
    nullif(trim(coalesce(lr.row_data->>'RegistradoPor', '')), '') as registered_by,
    nullif(trim(coalesce(lr.row_data->>'URL_Diploma', '')), '') as diploma_url,
    nullif(trim(coalesce(lr.row_data->>'InformePDF', '')), '') as report_url,
    nullif(trim(coalesce(lr.row_data->>'InformeCreadoPor', '')), '') as report_created_by,
    nullif(trim(coalesce(lr.row_data->>'InformeTipo', '')), '') as report_type,
    nullif(trim(coalesce(lr.row_data->>'InformeNombreArchivo', '')), '') as report_file_name,
    case
      when trim(coalesce(lr.row_data->>'InformeCreadoEl', '')) ~ '^\d{4}-\d{2}-\d{2}' then left(trim(lr.row_data->>'InformeCreadoEl'), 10)::date::timestamptz
      else null
    end as report_created_at,
    case
      when trim(coalesce(lr.row_data->>'AsistenciasCiclo', '')) ~ '^\d+(\.0+)?$' then regexp_replace(trim(lr.row_data->>'AsistenciasCiclo'), '\.0+$', '')::integer
      else null
    end as cycle_attendance
  from public.legacy_rows lr
  join public.legacy_sheets ls on ls.id = lr.legacy_sheet_id
  where ls.title = 'EXAMENES'
),
resolved as (
  select
    ler.*,
    m.id as member_id
  from legacy_exam_rows ler
  join public.members m
    on regexp_replace(trim(coalesce(m.legacy_id, '')), '\.0+$', '') = ler.legacy_member_id
  where ler.exam_date is not null
    and ler.grade is not null
)
insert into public.exams (
  legacy_row,
  exam_date,
  member_id,
  grade,
  cycle_attendance,
  examiner,
  registered_by,
  diploma_url,
  report_url,
  report_created_at,
  report_created_by,
  report_type,
  report_file_name
)
select
  resolved.row_number,
  resolved.exam_date,
  resolved.member_id,
  resolved.grade,
  resolved.cycle_attendance,
  resolved.examiner,
  resolved.registered_by,
  resolved.diploma_url,
  resolved.report_url,
  resolved.report_created_at,
  resolved.report_created_by,
  resolved.report_type,
  resolved.report_file_name
from resolved
where not exists (
  select 1
  from public.exams existing
  where existing.member_id = resolved.member_id
    and existing.exam_date = resolved.exam_date
    and upper(trim(existing.grade)) = upper(trim(resolved.grade))
);

with legacy_exam_rows as (
  select
    case
      when trim(coalesce(lr.row_data->>'FechaExamen', '')) ~ '^\d{4}-\d{2}-\d{2}' then left(trim(lr.row_data->>'FechaExamen'), 10)::date
      when trim(coalesce(lr.row_data->>'FechaExamen', '')) ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(trim(lr.row_data->>'FechaExamen'), 'DD/MM/YYYY')
      when trim(coalesce(lr.row_data->>'FechaExamen', '')) ~ '^\d{1,2}-\d{1,2}-\d{4}$' then to_date(trim(lr.row_data->>'FechaExamen'), 'DD-MM-YYYY')
      else null
    end as exam_date,
    regexp_replace(trim(coalesce(lr.row_data->>'ID', '')), '\.0+$', '') as legacy_member_id,
    nullif(trim(coalesce(lr.row_data->>'Grado', '')), '') as grade,
    nullif(trim(coalesce(lr.row_data->>'URL_Diploma', '')), '') as diploma_url,
    nullif(trim(coalesce(lr.row_data->>'InformePDF', '')), '') as report_url,
    nullif(trim(coalesce(lr.row_data->>'InformeCreadoPor', '')), '') as report_created_by,
    nullif(trim(coalesce(lr.row_data->>'InformeTipo', '')), '') as report_type,
    nullif(trim(coalesce(lr.row_data->>'InformeNombreArchivo', '')), '') as report_file_name,
    case
      when trim(coalesce(lr.row_data->>'InformeCreadoEl', '')) ~ '^\d{4}-\d{2}-\d{2}' then left(trim(lr.row_data->>'InformeCreadoEl'), 10)::date::timestamptz
      else null
    end as report_created_at
  from public.legacy_rows lr
  join public.legacy_sheets ls on ls.id = lr.legacy_sheet_id
  where ls.title = 'EXAMENES'
),
resolved as (
  select
    ler.*,
    m.id as member_id
  from legacy_exam_rows ler
  join public.members m
    on regexp_replace(trim(coalesce(m.legacy_id, '')), '\.0+$', '') = ler.legacy_member_id
  where ler.exam_date is not null
    and ler.grade is not null
)
update public.exams existing
set
  diploma_url = coalesce(existing.diploma_url, resolved.diploma_url),
  report_url = coalesce(existing.report_url, resolved.report_url),
  report_created_at = coalesce(existing.report_created_at, resolved.report_created_at),
  report_created_by = coalesce(existing.report_created_by, resolved.report_created_by),
  report_type = coalesce(existing.report_type, resolved.report_type),
  report_file_name = coalesce(existing.report_file_name, resolved.report_file_name)
from resolved
where existing.member_id = resolved.member_id
  and existing.exam_date = resolved.exam_date
  and upper(trim(existing.grade)) = upper(trim(resolved.grade));
