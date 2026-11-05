-- Synthetic teacher-approval checks. Always roll back: no emails, academic writes or lasting enrolments.
begin;
do $$
declare
 mid uuid:=gen_random_uuid(); other_mid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid();
 bid uuid:=gen_random_uuid(); expired_bid uuid:=gen_random_uuid();
 iid uuid:=gen_random_uuid(); deferred_id uuid:=gen_random_uuid(); expired_id uuid:=gen_random_uuid();
 ficha text:=md5(random()::text)||md5(random()::text);
 other_ficha text:=md5(random()::text)||md5(random()::text);
 h text:=md5(random()::text)||md5(random()::text);
 dh text:=md5(random()::text)||md5(random()::text);
 eh text:=md5(random()::text)||md5(random()::text);
 snapshot_value jsonb:=jsonb_build_object('name','Synthetic rollback student','memberClass','adults',
  'currentGrade','MINARAI','targetGrade','5 KYU','callKey','2099-12-05','examDate','2099-12-05');
begin
 if has_table_privilege('anon','public.exam_invitations','SELECT') or
    has_table_privilege('authenticated','public.exam_invitations','INSERT') or
    has_function_privilege('anon','public.respond_exam_invitation(text,text,text)','EXECUTE') or
    has_function_privilege('authenticated','public.approve_exam_invitation_batch(uuid,text,jsonb,jsonb)','EXECUTE') or
    has_function_privilege('anon','public.respond_exam_invitation_from_ficha(text,uuid,text,text)','EXECUTE') then
   raise exception 'Unexpected public access';
 end if;
 insert into members(id,first_name,class,status,grade,ficha_token,joined_on)
 values(mid,'Synthetic rollback owner','adults','active','MINARAI',ficha,'2020-01-01'),
       (other_mid,'Synthetic rollback other owner','adults','active','MINARAI',other_ficha,'2020-01-01');
 insert into exam_events(id,title,exam_date,program_type,status,notes)
 values(eid,'Synthetic rollback exam','2099-12-05','adults','active','Keep exam notes');
 insert into exam_invitation_batches(id,call_key,exam_date)
 values(bid,'2099-12-05','2099-12-05'),(expired_bid,'2099-06-05','2099-12-05');
 insert into exam_invitations(id,batch_id,call_key,member_id,exam_event_id,snapshot,subject,body,delivery_status,expires_at,exam_fee)
 values(iid,bid,'2099-12-05',mid,eid,snapshot_value,'Synthetic owner','Never sent','draft',now()+interval '1 day',15),
       (deferred_id,bid,'2099-12-05',other_mid,eid,snapshot_value,'Synthetic other','Never sent','draft',now()+interval '1 day',15),
       (expired_id,expired_bid,'2099-06-05',mid,eid,snapshot_value,'Synthetic expired','Never sent','draft',now()+interval '1 day',15);
 -- Preparing a draft never grants teacher approval or permission to respond.
 if exists(select 1 from exam_invitations where batch_id=bid and teacher_approved_at is not null) then raise exception 'Implicit draft approval'; end if;
 begin
  perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Unapproved');
  raise exception 'UNAPPROVED_WAS_ACCEPTED';
 exception when others then if sqlerrm='UNAPPROVED_WAS_ACCEPTED' then raise; end if; end;
 -- A mismatching preflight actual date cannot be authorised by the atomic RPC.
 begin
  perform approve_exam_invitation_batch(bid,'Synthetic teacher',jsonb_build_object(iid::text,h,deferred_id::text,dh),jsonb_build_object(eid::text,'2099-12-04'));
  raise exception 'STALE_DATE_WAS_APPROVED';
 exception when others then if sqlerrm='STALE_DATE_WAS_APPROVED' then raise; end if; end;
 perform approve_exam_invitation_batch(bid,'Synthetic teacher',jsonb_build_object(iid::text,h,deferred_id::text,dh),jsonb_build_object(eid::text,'2099-12-05'));
 perform approve_exam_invitation_batch(expired_bid,'Synthetic teacher',jsonb_build_object(expired_id::text,eh),jsonb_build_object(eid::text,'2099-12-05'));
 if (select teacher_approved_exam_date from exam_invitations where id=iid)<>'2099-12-05'::date or
    (select token_hash from exam_invitations where id=iid)<>h or
    (select delivery_status from exam_invitations where id=iid)<>'draft' then raise exception 'Approval changed delivery or missed scope'; end if;
 -- Another valid ficha cannot respond to this owner's invitation.
 begin
  perform respond_exam_invitation_from_ficha(other_ficha,iid,'accepted','Wrong owner');
  raise exception 'WRONG_OWNER_WAS_ACCEPTED';
 exception when others then if sqlerrm='WRONG_OWNER_WAS_ACCEPTED' then raise; end if; end;
 if exists(select 1 from exam_event_students where exam_event_id=eid) then raise exception 'Rejected request enrolled a student'; end if;
 perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Synthetic own ficha message');
 perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Synthetic replay');
 perform respond_exam_invitation(h,'accepted','Email-path same replay');
 if (select count(*) from exam_event_students where exam_event_id=eid and member_id=mid)<>1 then raise exception 'Duplicate acceptance'; end if;
 if (select message from exam_invitations where id=iid)<>'Synthetic own ficha message' then raise exception 'Replay overwrote message'; end if;
 perform respond_exam_invitation_from_ficha(other_ficha,deferred_id,'deferred','Synthetic defer message');
 if exists(select 1 from exam_event_students where exam_event_id=eid and member_id=other_mid) or
    (select message from exam_invitations where id=deferred_id)<>'Synthetic defer message' then raise exception 'Deferral enrolled a student or lost its message'; end if;
 begin
  perform respond_exam_invitation(h,'deferred','Opposite replay');
  raise exception 'OPPOSITE_WAS_ACCEPTED';
 exception when others then if sqlerrm='OPPOSITE_WAS_ACCEPTED' then raise; end if; end;
 update exam_invitations set expires_at=now()-interval '1 day' where id=expired_id;
 begin
  perform respond_exam_invitation(eh,'accepted','Expired');
  raise exception 'EXPIRED_WAS_ACCEPTED';
 exception when others then if sqlerrm='EXPIRED_WAS_ACCEPTED' then raise; end if; end;
 -- Revocation removes permission without deleting a previously accepted reservation.
 update exam_invitations set teacher_approved_at=null,teacher_approved_by=null,teacher_approved_exam_date=null where id=iid;
 begin
  perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Revoked replay');
  raise exception 'REVOKED_WAS_ACCEPTED';
 exception when others then if sqlerrm='REVOKED_WAS_ACCEPTED' then raise; end if; end;
 if (select count(*) from exam_event_students where exam_event_id=eid and member_id=mid)<>1 then raise exception 'Revocation deleted reservation'; end if;
 perform approve_exam_invitation_batch(bid,'Synthetic teacher',jsonb_build_object(iid::text,h,deferred_id::text,dh),jsonb_build_object(eid::text,'2099-12-05'));
 -- Grade changes invalidate permission; restoring this synthetic fixture permits the next check.
 update members set grade='5 KYU' where id=mid;
 begin
  perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Changed grade');
  raise exception 'CHANGED_GRADE_WAS_ACCEPTED';
 exception when others then if sqlerrm='CHANGED_GRADE_WAS_ACCEPTED' then raise; end if; end;
 update members set grade='MINARAI' where id=mid;
 perform update_exam_invitation_event(eid,'Edited synthetic','2099-12-20','Keep exam notes','2099-12-19T22:00:00Z');
 begin
  perform respond_exam_invitation_from_ficha(ficha,iid,'accepted','Changed date');
  raise exception 'CHANGED_DATE_WAS_ACCEPTED';
 exception when others then if sqlerrm='CHANGED_DATE_WAS_ACCEPTED' then raise; end if; end;
 if (select expires_at from exam_invitations where id=expired_id)<>'2099-12-19T22:00:00Z'::timestamptz then raise exception 'Expiry was not synchronized'; end if;
 if (select notes from exam_events where id=eid)<>'Keep exam notes' then raise exception 'Notes changed'; end if;
 if exists(select 1 from exam_event_students where exam_event_id=eid and final_passed is not null) or
    exists(select 1 from exams where member_id in(mid,other_mid)) or
    exists(select 1 from members where id in(mid,other_mid) and grade<>'MINARAI') then raise exception 'Unexpected academic result or promotion'; end if;
end $$;
select 'PASS: explicit approval scope, stale-date rejection, own-ficha binding, idempotence, deferral, revocation, expiry, grade/date invalidation and no academic writes; rolled back next' as result;
rollback;
