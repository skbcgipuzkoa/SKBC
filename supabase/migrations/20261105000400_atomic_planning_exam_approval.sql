-- Preserve existing approvals if replacing the proposed date or approval fails.
create or replace function public.replace_and_approve_exam_invitation_drafts(
 p_call date,p_member_ids uuid[],p_rows jsonb,p_actor text,p_event_dates jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare batch_uuid uuid; hashes jsonb;
begin
 if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then
  raise exception 'Convocatoria vacía';
 end if;
 batch_uuid := (p_rows->0->>'batch_id')::uuid;
 if batch_uuid is null or exists(select 1 from jsonb_array_elements(p_rows) item where (item->>'batch_id')::uuid is distinct from batch_uuid) then
  raise exception 'Lote inválido';
 end if;
 perform replace_exam_invitation_drafts(p_call,p_member_ids,p_rows);
 select jsonb_object_agg(id::text,replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
 into hashes from exam_invitations where batch_id=batch_uuid;
 perform approve_exam_invitation_batch(batch_uuid,p_actor,hashes,p_event_dates);
end $$;
revoke all on function public.replace_and_approve_exam_invitation_drafts(date,uuid[],jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.replace_and_approve_exam_invitation_drafts(date,uuid[],jsonb,text,jsonb) to service_role;
