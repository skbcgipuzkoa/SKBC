with trial_starts as (
  select
    id,
    coalesce(free_trial_started_on, joined_on)::date as started_on
  from public.members
  where free_trial_enabled is true
    and coalesce(free_trial_started_on, joined_on) is not null
),
minimum_free as (
  select
    id,
    (started_on + interval '1 month')::date as minimum_free_end
  from trial_starts
),
billing_dates as (
  select
    id,
    case
      when minimum_free_end <= make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15)
        then make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15)
      else (make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15) + interval '1 month')::date
    end as billing_on
  from minimum_free
)
update public.members as members
set
  free_trial_ends_on = greatest(coalesce(members.free_trial_ends_on, billing_dates.billing_on), billing_dates.billing_on),
  updated_at = now()
from billing_dates
where members.id = billing_dates.id
  and (
    members.free_trial_ends_on is null
    or members.free_trial_ends_on < billing_dates.billing_on
  );
