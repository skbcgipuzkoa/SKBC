update public.techniques t
set summary_es = nullif(trim(coalesce(
  lr.row_data->>'EXPLICACION_LARGA',
  lr.row_data->>'Explicacion larga',
  lr.row_data->>'EXPLICACION',
  lr.row_data->>'Explicacion',
  lr.row_data->>'DESCRIPCION_ES',
  lr.row_data->>'DESCRIPCION',
  lr.row_data->>'Descripcion',
  lr.row_data->>'DescripciÃ³n',
  lr.row_data->>'DETALLE',
  lr.row_data->>'Detalle',
  lr.row_data->>'RESUMEN_ES',
  lr.row_data->>'RESUMEN',
  lr.row_data->>'Resumen',
  ''
)), '')
from public.legacy_rows lr
join public.legacy_sheets ls on ls.id = lr.legacy_sheet_id
where ls.title = 'TECNICAS_ADULTOS'
  and nullif(trim(coalesce(lr.row_data->>'ID_TECNICA', '')), '') = t.legacy_id
  and nullif(trim(coalesce(
    lr.row_data->>'EXPLICACION_LARGA',
    lr.row_data->>'Explicacion larga',
    lr.row_data->>'EXPLICACION',
    lr.row_data->>'Explicacion',
    lr.row_data->>'DESCRIPCION_ES',
    lr.row_data->>'DESCRIPCION',
    lr.row_data->>'Descripcion',
    lr.row_data->>'DescripciÃ³n',
    lr.row_data->>'DETALLE',
    lr.row_data->>'Detalle',
    lr.row_data->>'RESUMEN_ES',
    lr.row_data->>'RESUMEN',
    lr.row_data->>'Resumen',
    ''
  )), '') is not null;

update public.technical_plans tp
set summary_es = t.summary_es
from public.techniques t
where t.id = tp.technique_id
  and t.summary_es is not null;
