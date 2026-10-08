-- A generated billing sheet proves that the free-trial workflow was already active
-- for this member. Preserve those existing promotions when the global setting changes.
update public.members as member
set
  free_trial_enabled = true,
  updated_at = now()
where coalesce(member.free_trial_enabled, false) = false
  and exists (
    select 1
    from public.family_billing_sheet_tasks as task
    where task.subject_member_id = member.id
      and task.status in ('pending', 'generated')
  );
