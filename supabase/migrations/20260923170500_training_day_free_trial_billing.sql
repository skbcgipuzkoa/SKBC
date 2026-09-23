with trial_starts as (
  select
    id,
    coalesce(free_trial_started_on, joined_on)::date as started_on,
    free_trial_ends_on
  from public.members
  where free_trial_enabled is true
    and coalesce(free_trial_started_on, joined_on) is not null
),
windows as (
  select
    id,
    started_on,
    free_trial_ends_on,
    (started_on + interval '1 month')::date as minimum_free_end,
    (date_trunc('month', started_on)::date + interval '1 month' + interval '14 days')::date as candidate_billing
  from trial_starts
),
counts as (
  select
    windows.*,
    (
      select count(*)::int
      from generate_series(windows.started_on, windows.minimum_free_end - 1, interval '1 day') as days(day)
      where extract(isodow from days.day) in (2, 4)
    ) as full_free_month_training_days,
    (
      select count(*)::int
      from generate_series(windows.started_on, windows.candidate_billing - 1, interval '1 day') as days(day)
      where extract(isodow from days.day) in (2, 4)
    ) as candidate_training_days
  from windows
),
billing_dates as (
  select
    id,
    free_trial_ends_on,
    case
      when minimum_free_end <= make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15)
        then make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15)
      else (make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15) + interval '1 month')::date
    end as previous_strict_billing_on,
    case
      when candidate_billing >= minimum_free_end then candidate_billing
      when candidate_training_days >= greatest(full_free_month_training_days - 1, 0) then candidate_billing
      when minimum_free_end <= make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15)
        then make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15)
      else (make_date(extract(year from minimum_free_end)::int, extract(month from minimum_free_end)::int, 15) + interval '1 month')::date
    end as billing_on
  from counts
)
update public.members as members
set
  free_trial_ends_on = case
    when members.free_trial_ends_on = billing_dates.previous_strict_billing_on then billing_dates.billing_on
    else greatest(coalesce(members.free_trial_ends_on, billing_dates.billing_on), billing_dates.billing_on)
  end,
  updated_at = now()
from billing_dates
where members.id = billing_dates.id
  and (
    members.free_trial_ends_on is null
    or members.free_trial_ends_on = billing_dates.previous_strict_billing_on
    or members.free_trial_ends_on < billing_dates.billing_on
  );
