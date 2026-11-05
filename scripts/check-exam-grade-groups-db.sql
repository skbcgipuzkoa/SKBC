-- Target-group integration smoke: synthetic members only; no mail; transaction always rolled back.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 source_event uuid:=gen_random_uuid(); spare_event uuid:=gen_random_uuid(); batch_one uuid:=gen_random_uuid(); batch_two uuid:=gen_random_uuid();
 ia uuid:=gen_random_uuid(); ib uuid:=gen_random_uuid(); ic uuid:=gen_random_uuid(); id_new uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); ec uuid:=gen_random_uuid(); base5 uuid:=gen_random_uuid(); base2 uuid:=gen_random_uuid(); manual5 uuid:=gen_random_uuid();
 reserved uuid:=gen_random_uuid(); ha text:=md5(random()::text)||md5(random()::text); hb text:=md5(random()::text)||md5(random()::text);
 hc text:=md5(random()::text)||md5(random()::text); hd text:=md5(random()::text)||md5(random()::text);
 snap5 jsonb:=jsonb_build_object('memberClass','adults','currentGrade','MINARAI','targetGrade','5 KYU','callKey','2099-12-05','callMonth','2099-12','examDate','2099-12-15','dateConfirmed',true);
 snap2 jsonb:=jsonb_build_object('memberClass','adults','currentGrade','3 KYU','targetGrade','2 KYU','callKey','2099-12-05','callMonth','2099-12','examDate','2099-12-15','dateConfirmed',true);
 group5 uuid; group2 uuid; alias5 uuid; result jsonb; source_version timestamptz; stale_writes integer;
begin
 if has_table_privilege('anon','public.exam_call_grade_groups','SELECT') or has_function_privilege('authenticated','public.reconcile_unstarted_invitation_grade_groups(boolean,uuid)','EXECUTE') then raise exception 'Unexpected group access'; end if;
 insert into members(id,first_name,class,status,grade) values(a,'Synthetic group A','adults','active','MINARAI'),(b,'Synthetic group B','adults','active','MINARAI'),(c,'Synthetic group C','adults','active','3 KYU'),(d,'Synthetic group D','adults','active','MINARAI');
 insert into exam_events(id,title,exam_date,program_type,status,call_month,date_confirmed) values(source_event,'Synthetic legacy mixed','2099-12-15','adults','active','2099-12',true);
 insert into exam_event_items(id,exam_event_id,name,grade) values(base5,source_event,'Five target syllabus','5 KYU'),(base2,source_event,'Two target syllabus','2 KYU');
 insert into exam_event_items(exam_event_id,name,grade) values(source_event,'Common manual review',null);
 insert into exam_event_examiners(id,exam_event_id,name) values(ea,source_event,'Only five examiner'),(ec,source_event,'Only two examiner');
 update exam_events set notes=jsonb_build_object('examAssignmentsVersion',1,'text','Preserve teacher notes','scopes',jsonb_build_object(ea::text,jsonb_build_array('5 KYU'),ec::text,jsonb_build_array('2 KYU')),'gradeGroupMode',true,'pendingExaminerIds','[]'::jsonb)::text where id=source_event;
 insert into exam_invitation_batches(id,call_key,exam_date) values(batch_one,'2099-12-05','2099-12-15'),(batch_two,'2099-12-05','2099-12-15');
 insert into exam_invitations(id,batch_id,call_key,member_id,exam_event_id,token_hash,snapshot,subject,body,expires_at,exam_fee,teacher_approved_at,teacher_approved_by,teacher_approved_exam_date,response,message,responded_at)
 values(ia,batch_one,'2099-12-05',a,source_event,ha,snap5,'Synthetic','No mail','2099-12-15T00:00:00+01:00',15,now(),'Synthetic teacher','2099-12-15','accepted','Preserve old acceptance',now()),
 (ib,batch_two,'2099-12-05',b,source_event,hb,snap5,'Synthetic','No mail','2099-12-15T00:00:00+01:00',15,now(),'Synthetic teacher','2099-12-15',null,null,null),
 (ic,batch_one,'2099-12-05',c,source_event,hc,snap2,'Synthetic','No mail','2099-12-15T00:00:00+01:00',15,now(),'Synthetic teacher','2099-12-15',null,null,null);
 insert into exam_event_students(id,exam_event_id,member_id,display_order,current_grade,target_grade) values(reserved,source_event,a,1,'MINARAI','5 KYU');
 select updated_at into source_version from exam_events where id=source_event;
 result:=reconcile_unstarted_invitation_grade_groups(false,source_event);
 if exists(select 1 from exam_call_grade_groups where call_month='2099-12') then raise exception 'Dry-run mutated groups'; end if;
 result:=reconcile_unstarted_invitation_grade_groups(true,source_event);
 if (select updated_at from exam_events where id=source_event)<=source_version or (select status from exam_events where id=source_event)<>'archived' then raise exception 'Old source snapshot was not invalidated safely'; end if;
 update exam_events set notes='Stale writer' where id=source_event and updated_at=source_version;
 get diagnostics stale_writes=row_count;
 if stale_writes<>0 then raise exception 'Stale source mutation was accepted'; end if;
 select event_id into group5 from exam_call_grade_groups where call_month='2099-12' and program_type='adults' and target_grade='5 KYU';
 select event_id into group2 from exam_call_grade_groups where call_month='2099-12' and program_type='adults' and target_grade='2 KYU';
 if group5 is null or group2 is null or group5=group2 then raise exception 'Different targets were not isolated'; end if;
 if (select exam_event_id from exam_event_students where id=reserved)<>group5 or (select message from exam_invitations where id=ia)<>'Preserve old acceptance' then raise exception 'Existing reservation or response lost'; end if;
 if exists(select 1 from exam_event_items where exam_event_id=group5 and grade='2 KYU') or exists(select 1 from exam_event_items where exam_event_id=group2 and grade='5 KYU') then raise exception 'Wrong target curriculum'; end if;
 if not exists(select 1 from exam_event_items where exam_event_id=group5 and grade='5 KYU') then raise exception 'Missing target syllabus'; end if;
 if exists(select 1 from exam_event_examiners where exam_event_id=group5 and source_examiner_id=ec) or not exists(select 1 from exam_event_examiners where exam_event_id=group5 and source_examiner_id=ea) then raise exception 'Examiner access broadened'; end if;
 select id into alias5 from exam_event_examiners where exam_event_id=group5 and source_examiner_id=ea;
 if not exists(select 1 from exam_event_examiners where id=ea and access_token is not null) then raise exception 'Old examiner token deleted'; end if;
 -- The next batch claims the same prepared group without replacing manual changes.
 insert into exam_event_items(id,exam_event_id,name,grade) values(manual5,group5,'Teacher manual addition','5 KYU');
 update exam_event_items set active=false where exam_event_id=group5 and name='Five target syllabus';
 insert into exam_events(id,title,exam_date,program_type,status,target_grade,call_month,date_confirmed) values(spare_event,'Synthetic later preparation','2099-12-15','adults','active','5 KYU','2099-12',true);
 result:=claim_prepared_exam_grade_group(spare_event,'2099-12','adults','5 KYU','2099-12-15',true);
 if (result->>'eventId')::uuid<>group5 then raise exception 'A second batch created a different same-grade exam'; end if;
 perform discard_unclaimed_exam_preparation(group5);
 if not exists(select 1 from exam_events where id=group5) then raise exception 'Cleanup removed canonical exam'; end if;
 perform discard_unclaimed_exam_preparation(spare_event);
 if exists(select 1 from exam_events where id=spare_event) then raise exception 'Unused preparation not discarded'; end if;
 begin
  perform claim_prepared_exam_grade_group(gen_random_uuid(),'2099-12','adults','5 KYU','2099-12-20',true);
  raise exception 'CONFLICTING_DAY_WAS_ACCEPTED';
 exception when others then if sqlerrm='CONFLICTING_DAY_WAS_ACCEPTED' then raise; end if; end;
 perform respond_exam_invitation(hb,'accepted','Second-batch acceptance');
 perform respond_exam_invitation(hb,'accepted','Idempotent replay');
 perform respond_exam_invitation(hc,'accepted','Other target acceptance');
 if (select count(*) from exam_event_students where exam_event_id=group5)<>2 or (select count(*) from exam_event_students where exam_event_id=group2)<>1 then raise exception 'Acceptance did not group by target'; end if;
 if not exists(select 1 from exam_event_items where id=manual5 and exam_event_id=group5) or exists(select 1 from exam_event_items where exam_event_id=group5 and name='Five target syllabus' and active) then raise exception 'Later join overwrote manual syllabus edits'; end if;
 -- Child scopes retain the progressive chain, never higher stages.
 if not exam_group_item_in_scope('kids','AMARILLO','BLANCO') or not exam_group_item_in_scope('kids','AMARILLO','BLANCO-AMARILLO') or exam_group_item_in_scope('kids','AMARILLO','NARANJA') then raise exception 'Child progressive scope changed'; end if;
 insert into exam_event_scores(exam_event_id,event_student_id,event_item_id,examiner_id,score) values(group5,reserved,manual5,alias5,80);
 insert into exam_invitations(id,batch_id,call_key,member_id,exam_event_id,token_hash,snapshot,subject,body,expires_at,exam_fee,teacher_approved_at,teacher_approved_by,teacher_approved_exam_date)
 values(id_new,batch_two,'2099-12-05',d,group5,hd,snap5,'Synthetic','No mail','2099-12-15T00:00:00+01:00',15,now(),'Synthetic teacher','2099-12-15');
 begin
  perform respond_exam_invitation(hd,'accepted','Too late');
  raise exception 'STARTED_GROUP_ACCEPTED_NEW_STUDENT';
 exception when others then if sqlerrm='STARTED_GROUP_ACCEPTED_NEW_STUDENT' then raise; end if; end;
 if exists(select 1 from exam_event_students where exam_event_id=group5 and member_id=d) or exists(select 1 from exams where member_id in(a,b,c,d)) or exists(select 1 from exam_event_students where exam_event_id in(group5,group2) and final_passed is not null) then raise exception 'Unexpected enrolment or academic result'; end if;
end $$;
select 'PASS: same-call target groups, preserved existing reservation/tokens/manual syllabus, independent grades, scoped examiner aliases, pending-day conflict and started-group rejection; rolled back next' as result;
rollback;
