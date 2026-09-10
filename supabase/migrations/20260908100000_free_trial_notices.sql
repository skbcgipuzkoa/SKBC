alter table public.members
  add column if not exists free_trial_enabled boolean not null default false,
  add column if not exists free_trial_started_on date,
  add column if not exists free_trial_ends_on date,
  add column if not exists free_trial_notice_read_at timestamptz;

create index if not exists members_free_trial_due_idx
  on public.members(status, free_trial_enabled, free_trial_ends_on, free_trial_notice_read_at);

update public.members
set
  free_trial_enabled = true,
  free_trial_started_on = coalesce(free_trial_started_on, joined_on),
  free_trial_ends_on = coalesce(free_trial_ends_on, (joined_on + interval '1 month')::date),
  updated_at = now()
where status = 'active'
  and joined_on is not null
  and joined_on >= current_date - interval '1 month'
  and free_trial_enabled = false;
