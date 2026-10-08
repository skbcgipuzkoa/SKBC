with billing_dates as (
  select
    id,
    free_trial_ends_on,
    (coalesce(free_trial_started_on, joined_on)::date + interval '1 month')::date as trial_end
  from public.members
  where free_trial_enabled is true
    and coalesce(free_trial_started_on, joined_on) is not null
), corrections as (
  select
    id,
    free_trial_ends_on,
    case
      when extract(day from trial_end) = 1
        then (date_trunc('month', trial_end) + interval '1 month' + interval '14 days')::date
      else (date_trunc('month', trial_end) + interval '2 months' + interval '14 days')::date
    end as previous_automatic_billing_on,
    case
      when extract(day from trial_end) <= 18
        then (date_trunc('month', trial_end) + interval '1 month' + interval '14 days')::date
      else (date_trunc('month', trial_end) + interval '2 months' + interval '14 days')::date
    end as corrected_billing_on
  from billing_dates
)
update public.members as members
set
  free_trial_ends_on = corrections.corrected_billing_on,
  updated_at = now()
from corrections
where members.id = corrections.id
  and (
    members.free_trial_ends_on = corrections.previous_automatic_billing_on
    or members.free_trial_ends_on is null
    or members.free_trial_ends_on < corrections.corrected_billing_on
  )
  and members.free_trial_ends_on is distinct from corrections.corrected_billing_on;
