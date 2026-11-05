-- Synthetic invitation checks. Always roll back: no emails, grades or lasting enrolments.
begin;
do $$
declare
  mid uuid; eid uuid := gen_random_uuid(); bid uuid := gen_random_uuid(); bid2 uuid := gen_random_uuid();
  iid uuid := gen_random_uuid(); expired_id uuid := gen_random_uuid();
  deferred_id uuid := gen_random_uuid(); revoked_id uuid := gen_random_uuid();
  h text := md5(random()::text)||md5(random()::text);
  eh text := md5(random()::text)||md5(random()::text);
  dh text := md5(random()::text)||md5(random()::text);
  rh text := md5(random()::text)||md5(random()::text);
begin
  select id into mid from members where status='active' and class='adults' limit 1;
  if mid is null then raise exception 'No active fixture reference'; end if;
  if has_table_privilege('anon','public.exam_invitations','SELECT') or
     has_table_privilege('authenticated','public.exam_invitations','INSERT') or
     has_function_privilege('anon','public.respond_exam_invitation(text,text,text)','EXECUTE') then
    raise exception 'Unexpected public access';
  end if;
  insert into exam_events(id,title,exam_date,program_type,status,notes)
    values(eid,'SKBC rollback test','2099-12-05','adults','active','Keep exam notes');
  insert into exam_invitation_batches(id,call_key,exam_date) values(bid,'2099-12-05','2099-12-05'),(bid2,'2099-06-05','2099-12-05');
  insert into exam_invitations(id,batch_id,call_key,member_id,exam_event_id,token_hash,snapshot,subject,body,delivery_status,expires_at,exam_fee)
    values(iid,bid,'2099-12-05',mid,eid,h,'{"name":"Synthetic","currentGrade":"MINARAI","targetGrade":"5 KYU"}','Synthetic','Not sent','sent',now()+interval '1 day',15),
          (expired_id,bid2,'2099-06-05',mid,eid,eh,'{}','Synthetic expired','Not sent','sent',now()-interval '1 day',15);
  perform respond_exam_invitation(h,'accepted','Synthetic message');
  perform respond_exam_invitation(h,'accepted','Synthetic replay');
  if (select count(*) from exam_event_students where exam_event_id=eid and member_id=mid)<>1 then raise exception 'Duplicate acceptance'; end if;
  if exists(select 1 from exam_event_students where exam_event_id=eid and final_passed is not null) then raise exception 'Unexpected exam result'; end if;
  begin
    perform respond_exam_invitation(h,'deferred','Opposite replay');
    raise exception 'OPPOSITE_WAS_ACCEPTED';
  exception when others then
    if sqlerrm='OPPOSITE_WAS_ACCEPTED' then raise; end if;
  end;
  begin
    perform respond_exam_invitation(eh,'accepted','Expired');
    raise exception 'EXPIRED_WAS_ACCEPTED';
  exception when others then
    if sqlerrm='EXPIRED_WAS_ACCEPTED' then raise; end if;
  end;
  perform update_exam_invitation_event(eid,'Edited synthetic','2099-12-20','Keep exam notes','2099-12-19T22:00:00Z');
  if (select expires_at from exam_invitations where id=expired_id)<>'2099-12-19T22:00:00Z'::timestamptz then raise exception 'Expiry was not synchronized'; end if;
  if (select notes from exam_events where id=eid)<>'Keep exam notes' then raise exception 'Notes changed'; end if;
end $$;
select 'PASS: access restrictions, idempotent acceptance, opposite/expired rejection, notes and expiry; rolled back next' as result;
rollback;
