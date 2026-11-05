-- Synthetic records only; never approve a real student. Roll back the entire check.
begin;
do $$
declare
 mid uuid:=gen_random_uuid(); b1 uuid:=gen_random_uuid(); b2 uuid:=gen_random_uuid();
 e1 uuid:=gen_random_uuid(); e2 uuid:=gen_random_uuid(); old_id uuid; replacement jsonb; first_rows jsonb;
 snap jsonb:=jsonb_build_object('name','Synthetic planning check','currentGrade','MINARAI','targetGrade','5 KYU','memberClass','adults','examDate','2099-12-05');
begin
 if has_function_privilege('anon','public.replace_and_approve_exam_invitation_drafts(date,uuid[],jsonb,text,jsonb)','execute') or
    has_function_privilege('authenticated','public.replace_and_approve_exam_invitation_drafts(date,uuid[],jsonb,text,jsonb)','execute') then raise exception 'Unexpected public execution'; end if;
 insert into members(id,first_name,class,status,grade,joined_on) values(mid,'Synthetic planning check','adults','active','MINARAI','2020-01-01');
 insert into exam_events(id,title,exam_date,program_type,status) values(e1,'Synthetic old','2099-12-05','adults','active'),(e2,'Synthetic replacement','2099-12-20','adults','active');
 insert into exam_invitation_batches(id,call_key,exam_date) values(b1,'2099-12-05','2099-12-05'),(b2,'2099-12-05','2099-12-20');
 first_rows:=jsonb_build_array(jsonb_build_object('batch_id',b1,'call_key','2099-12-05','member_id',mid,'exam_event_id',e1,'snapshot',snap,'subject','Not sent','body','Not sent','exam_fee',15,'expires_at','2099-12-04T22:00:00Z'));
 perform replace_and_approve_exam_invitation_drafts('2099-12-05',array[mid],first_rows,'Synthetic teacher',jsonb_build_object(e1::text,'2099-12-05'));
 select id into old_id from exam_invitations where batch_id=b1 and teacher_approved_at is not null;
 if old_id is null then raise exception 'Initial approval missing'; end if;
 replacement:=jsonb_build_array(jsonb_build_object('batch_id',b2,'call_key','2099-12-05','member_id',mid,'exam_event_id',e2,'snapshot',snap||jsonb_build_object('examDate','2099-12-20'),'subject','Not sent','body','Not sent','exam_fee',15,'expires_at','2099-12-19T22:00:00Z'));
 begin
  perform replace_and_approve_exam_invitation_drafts('2099-12-05',array[mid],replacement,'Synthetic teacher',jsonb_build_object(e2::text,'2099-12-19'));
  raise exception 'STALE_DATE_APPROVED';
 exception when others then if sqlerrm='STALE_DATE_APPROVED' then raise; end if; end;
 if not exists(select 1 from exam_invitations where id=old_id and teacher_approved_exam_date='2099-12-05') or
    not exists(select 1 from exam_events where id=e1) or exists(select 1 from exam_invitations where batch_id=b2) then raise exception 'Failed replacement changed previous authorisation'; end if;
 perform replace_and_approve_exam_invitation_drafts('2099-12-05',array[mid],replacement,'Synthetic teacher',jsonb_build_object(e2::text,'2099-12-20'));
 if exists(select 1 from exam_invitations where id=old_id) or not exists(select 1 from exam_invitations where batch_id=b2 and teacher_approved_exam_date='2099-12-20' and token_hash ~ '^[a-f0-9]{64}$' and response is null and delivery_status='draft') then raise exception 'Replacement approval missing'; end if;
 if exists(select 1 from exam_event_students where member_id=mid) or exists(select 1 from exams where member_id=mid) or
    not exists(select 1 from members where id=mid and grade='MINARAI') then raise exception 'Unexpected enrolment or grade change'; end if;
end $$;
select 'PASS: direct approval, editable actual date, failed replacement preserves prior approval, permissions, no enrolment or promotion; rolled back next' as result;
rollback;
