alter table public.techniques
  add column if not exists summary_es text;

alter table public.technical_plans
  add column if not exists summary_es text;

update public.techniques t
set summary_es = nullif(trim(coalesce(
  lr.row_data->>'RESUMEN_ES',
  lr.row_data->>'RESUMEN',
  lr.row_data->>'Resumen',
  lr.row_data->>'DESCRIPCION_ES',
  lr.row_data->>'DESCRIPCION',
  lr.row_data->>'Descripción',
  lr.row_data->>'EXPLICACION',
  lr.row_data->>'Explicacion',
  lr.row_data->>'DETALLE',
  lr.row_data->>'Detalle',
  ''
)), '')
from public.legacy_rows lr
join public.legacy_sheets ls on ls.id = lr.legacy_sheet_id
where ls.title = 'TECNICAS_ADULTOS'
  and nullif(trim(coalesce(lr.row_data->>'ID_TECNICA', '')), '') = t.legacy_id
  and t.summary_es is null;

update public.technical_plans tp
set summary_es = t.summary_es
from public.techniques t
where t.id = tp.technique_id
  and tp.summary_es is null
  and t.summary_es is not null;
