-- Synthetic monthly-planning smoke. Run as service/admin; always ROLLBACK. No emails or real student rows.
begin;
do $$
declare
 mid uuid:=gen_random_uuid(); other_mid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); legacy_eid uuid:=gen_random_uuid();
 bid uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); other_iid uuid:=gen_random_uuid();
 itemid uuid:=gen_random_uuid(); examinerid uuid:=gen_random_uuid(); studentid uuid;
 ficha text:=replace(gen_random_uuid()::text,'-',''); other_ficha text:=replace(gen_random_uuid()::text,'-','');
 h text:=md5(random()::text)||md5(random()::text); oh text:=md5(random()::text)||md5(random()::text);
 snap jsonb:=jsonb_build_object('name','Synthetic monthly','memberClass','adults','currentGrade','MINARAI','targetGrade','5 KYU','examDate','2099-12-31','callKey','2099-12-05','callMonth','2099-12','dateConfirmed',false);
 updates jsonb;
begin
 if has_function_privilege('anon','public.confirm_planning_exam_date(uuid,date,date,text,jsonb)','EXECUTE') or
 has_function_privilege('authenticated','public.confirm_planning_exam_date(uuid,date,date,text,jsonb)','EXECUTE') then raise exception 'Unexpected confirmation access'; end if;
 insert into members(id,first_name,class,status,grade,ficha_token) values
 (mid,'Synthetic monthly owner','adults','active','MINARAI',ficha),(other_mid,'Synthetic monthly deferred','adults','active','MINARAI',other_ficha);
 insert into exam_events(id,title,exam_date,program_type,status,call_month,date_confirmed)
 values(eid,'Synthetic month only','2099-12-31','adults','active','2099-12',false);
 insert into exam_events(id,title,exam_date,program_type,status) values(legacy_eid,'Synthetic existing-style exam','2099-12-01','adults','active');
 if not(select date_confirmed from exam_events where id=legacy_eid) then raise exception 'Existing exam default changed'; end if;
 insert into exam_invitation_batches(id,call_key,exam_date) values(bid,'2099-12-05','2099-12-31');
 insert into exam_invitations(id,batch_id,call_key,member_id,exam_event_id,snapshot,subject,body,expires_at,exam_fee)
 values(iid,bid,'2099-12-05',mid,eid,snap,'Synthetic','Diciembre: día pendiente de confirmar','2099-12-31T00:00:00+01:00',15),
 (other_iid,bid,'2099-12-05',other_mid,eid,snap,'Synthetic','Diciembre: día pendiente de confirmar','2099-12-31T00:00:00+01:00',15);
 perform approve_exam_invitation_batch(bid,'Synthetic teacher',jsonb_build_object(iid::text,h,other_iid::text,oh),jsonb_build_object(eid::text,'2099-12-31'));
 perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Preserve accepted message');
 perform respond_exam_invitation_from_ficha(other_ficha,other_iid,'deferred','Preserve deferred message');
 select id into studentid from exam_event_students where exam_event_id=eid and member_id=mid;
 if studentid is null then raise exception 'Month-only acceptance did not reserve'; end if;
 insert into exam_event_items(id,exam_event_id,source,name) values(itemid,eid,'manual','Synthetic technique');
 insert into exam_event_examiners(id,exam_event_id,name) values(examinerid,eid,'Synthetic examiner');
 begin
  insert into exam_event_scores(exam_event_id,event_student_id,event_item_id,examiner_id,score) values(eid,studentid,itemid,examinerid,80);
  raise exception 'PENDING_DATE_WAS_EVALUATED';
 exception when others then if sqlerrm='PENDING_DATE_WAS_EVALUATED' then raise; end if; end;
 begin
  update exam_events set status='completed' where id=eid;
  raise exception 'PENDING_DATE_WAS_FINALIZED';
 exception when others then if sqlerrm='PENDING_DATE_WAS_FINALIZED' then raise; end if; end;
 updates:=jsonb_build_object(iid::text,jsonb_build_object('reason','Synthetic fresh preparation','deficits','[]'::jsonb,'body','Synthetic confirmed 2099-12-15'),
 other_iid::text,jsonb_build_object('reason','Synthetic fresh preparation','deficits','[]'::jsonb,'body','Synthetic confirmed 2099-12-15'));
 begin
  perform confirm_planning_exam_date(eid,'2099-11-15','2099-12-31','2099-12',updates);
  raise exception 'WRONG_MONTH_WAS_CONFIRMED';
 exception when others then if sqlerrm='WRONG_MONTH_WAS_CONFIRMED' then raise; end if; end;
 begin
  perform confirm_planning_exam_date(eid,'2099-12-15','2099-12-30','2099-12',updates);
  raise exception 'STALE_DATE_WAS_CONFIRMED';
 exception when others then if sqlerrm='STALE_DATE_WAS_CONFIRMED' then raise; end if; end;
 perform confirm_planning_exam_date(eid,'2099-12-15','2099-12-31','2099-12',updates);
 if not(select date_confirmed from exam_events where id=eid) or (select exam_date from exam_events where id=eid)<>'2099-12-15'::date then raise exception 'Day not confirmed'; end if;
 if exists(select 1 from exam_invitations where exam_event_id=eid and
 (teacher_approved_exam_date<>'2099-12-15'::date or expires_at<>'2099-12-15T00:00:00+01:00'::timestamptz or snapshot->>'examDate'<>'2099-12-15' or snapshot->>'dateConfirmed'<>'true')) then raise exception 'Invitation scope or expiry not confirmed'; end if;
 if (select response from exam_invitations where id=iid)<>'accepted' or (select message from exam_invitations where id=iid)<>'Preserve accepted message' or
 (select response from exam_invitations where id=other_iid)<>'deferred' or (select message from exam_invitations where id=other_iid)<>'Preserve deferred message' then raise exception 'Confirmation changed responses'; end if;
 perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Replay after confirmation');
 if (select count(*) from exam_event_students where exam_event_id=eid)<>1 then raise exception 'Confirmation changed enrolment'; end if;
 updates:=replace(updates::text,'2099-12-15','2099-12-20')::jsonb;
 perform confirm_planning_exam_date(eid,'2099-12-20','2099-12-15','2099-12',updates);
 if (select exam_date from exam_events where id=eid)<>'2099-12-20'::date then raise exception 'Same-month reconfirmation failed'; end if;
 -- Evaluation is permitted after confirmation; once started, changing the day is blocked.
 insert into exam_event_scores(exam_event_id,event_student_id,event_item_id,examiner_id,score) values(eid,studentid,itemid,examinerid,80);
 begin
  perform confirm_planning_exam_date(eid,'2099-12-21','2099-12-20','2099-12',updates);
  raise exception 'STARTED_EXAM_WAS_MOVED';
 exception when others then if sqlerrm='STARTED_EXAM_WAS_MOVED' then raise; end if; end;
 if exists(select 1 from exams where member_id in(mid,other_mid)) or exists(select 1 from members where id in(mid,other_mid) and grade<>'MINARAI') or
 exists(select 1 from exam_event_students where exam_event_id=eid and final_passed is not null) then raise exception 'Unexpected academic result'; end if;
end $$;
select 'PASS: month-only approval and responses, hidden cutoff state, pending-date evaluation guards, same-month confirmation/reconfirmation, preserved messages/reservations, started-exam protection and no promotions; rolled back next' as result;
rollback;
