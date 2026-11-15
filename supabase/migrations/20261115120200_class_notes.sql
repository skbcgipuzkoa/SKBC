create function public.publish_class_notes(p_member uuid, p_date date, p_note text, p_behavior jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Madrid')::date;
  entry_id text := 'CLASS-NOTES-' || p_member || '-' || p_date;
begin
  perform 1 from public.members where id = p_member and class = 'kids' and status = 'active' for update;
  if not found or p_date is null or p_date < today or nullif(btrim(p_note), '') is null then
    raise exception 'Publicación no válida';
  end if;
  delete from public.child_notes where member_id = p_member and legacy_id like 'CLASS-NOTES-%' and note_date > today;
  delete from public.child_behavior_reports where member_id = p_member and legacy_id like 'CLASS-NOTES-%' and report_date > today;
  insert into public.child_notes(member_id,legacy_id,note_date,note_type,note,visible_family,author)
    values(p_member,entry_id,p_date,'NOTA DEL SENSEI',p_note,true,'Sensei')
    on conflict(legacy_id) do update set note = excluded.note, updated_at = now();
  insert into public.child_behavior_reports(member_id,legacy_id,report_date,attitude,attention,respect,effort,companionship,observation)
    values(p_member,entry_id,p_date,p_behavior->>'attitude',p_behavior->>'attention',p_behavior->>'respect',
      p_behavior->>'effort',p_behavior->>'companionship',p_behavior->>'observation')
    on conflict(legacy_id) do update set attitude = excluded.attitude, attention = excluded.attention,
      respect = excluded.respect, effort = excluded.effort, companionship = excluded.companionship,
      observation = excluded.observation, updated_at = now();
end;
$$;
revoke all on function public.publish_class_notes(uuid,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_class_notes(uuid,date,text,jsonb) to service_role;
