alter table public.techniques
  add column if not exists variant text,
  add column if not exists variant_note text;

alter table public.technical_plans
  add column if not exists variant text,
  add column if not exists variant_note text;

update public.techniques
set
  variant = coalesce(public.techniques.variant, detected.variant),
  variant_note = coalesce(public.techniques.variant_note, detected.variant_note)
from (
  select
    id,
    case
      when lower(name) like '%katate%' then 'Katate'
      when lower(name) like '%morote%' then 'Morote'
      when lower(name) like '%ryote%' then 'Ryote'
      when lower(name) like '% ura %' or lower(name) like 'ura %' then 'Ura'
      when lower(name) like '% omote %' or lower(name) like 'omote %' then 'Omote'
      else null
    end as variant,
    case
      when lower(name) like '%katate%' then 'Agarre 1 a 1.'
      when lower(name) like '%morote%' then 'Agarre 2 a 1.'
      when lower(name) like '%ryote%' then 'Agarre 2 a 2.'
      when lower(name) like '% ura %' or lower(name) like 'ura %' then 'Variante por fuera.'
      when lower(name) like '% omote %' or lower(name) like 'omote %' then 'Variante por dentro.'
      else null
    end as variant_note
  from public.techniques
) detected
where detected.id = public.techniques.id
  and detected.variant is not null;

update public.technical_plans tp
set
  variant = coalesce(tp.variant, t.variant),
  variant_note = coalesce(tp.variant_note, t.variant_note)
from public.techniques t
where t.id = tp.technique_id
  and (tp.variant is null or tp.variant_note is null);
