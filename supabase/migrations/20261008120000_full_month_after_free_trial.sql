with calculated as (
  select
    id,
    free_trial_ends_on,
    coalesce(free_trial_started_on, joined_on)::date + interval '1 month' as trial_end
  from public.members
  where free_trial_enabled is true
    and coalesce(free_trial_started_on, joined_on) is not null
),
billing_dates as (
  select
    id,
    free_trial_ends_on,
    case
      when extract(day from trial_end) = 1
        then (date_trunc('month', trial_end) + interval '1 month' + interval '14 days')::date
      else (date_trunc('month', trial_end) + interval '2 months' + interval '14 days')::date
    end as billing_on
  from calculated
)
update public.members as members
set
  free_trial_ends_on = greatest(coalesce(members.free_trial_ends_on, billing_dates.billing_on), billing_dates.billing_on),
  updated_at = now()
from billing_dates
where members.id = billing_dates.id
  and (members.free_trial_ends_on is null or members.free_trial_ends_on < billing_dates.billing_on);
