alter table public.exam_event_examiners add column source_examiner_id uuid references public.exam_event_examiners(id) on delete restrict;
create unique index exam_examiner_source_group_unique on public.exam_event_examiners(source_examiner_id,exam_event_id) where source_examiner_id is not null;

-- One prepared invitation exam per call month, program and target grade.
create table public.exam_call_grade_groups (
 call_month text not null check(call_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 program_type text not null,target_grade text not null,event_id uuid not null unique references public.exam_events(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(call_month,program_type,target_grade)
);
alter table public.exam_call_grade_groups enable row level security;
revoke all on public.exam_call_grade_groups from anon,authenticated;
grant all on public.exam_call_grade_groups to service_role;

create or replace function public.exam_group_is_unstarted(p_event uuid) returns boolean
language sql stable set search_path=public as $$
 select exists(select 1 from exam_events where id=p_event and status in ('active','draft'))
 and not exists(select 1 from exam_event_scores where exam_event_id=p_event)
 and not exists(select 1 from exam_event_examiners where exam_event_id=p_event and submitted_at is not null)
 and not exists(select 1 from exam_event_students where exam_event_id=p_event and (final_passed is not null or final_percentage is not null))
 and not exists(select 1 from exam_event_reviews where exam_event_id=p_event and (reviewed_at is not null or final_passed is not null or coalesce(review_notes,'')<>''));
$$;
create or replace function public.discard_unclaimed_exam_preparation(p_event_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from exam_events where id=p_event_id for update;
 delete from exam_events e where e.id=p_event_id and exam_group_is_unstarted(e.id)
 and not exists(select 1 from exam_call_grade_groups where event_id=e.id)
 and not exists(select 1 from exam_invitations where exam_event_id=e.id)
 and not exists(select 1 from exam_event_students where exam_event_id=e.id);
end $$;
create or replace function public.claim_prepared_exam_grade_group(p_event_id uuid,p_call_month text,p_program text,p_target text,p_exam_date date,p_date_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare chosen uuid; ev public.exam_events;
begin
 if p_call_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or coalesce(trim(p_target),'')='' or p_program not in ('adults','kids','kids_progressive','dan_tribunal') then raise exception 'Grupo de examen inválido'; end if;
 perform pg_advisory_xact_lock(hashtext(p_call_month||':'||p_program||':'||p_target));
 select event_id into chosen from exam_call_grade_groups where call_month=p_call_month and program_type=p_program and target_grade=p_target;
 if chosen is null then
  select * into ev from exam_events where id=p_event_id for update;
  if not found or not exam_group_is_unstarted(ev.id) or ev.exam_date is distinct from p_exam_date or ev.date_confirmed is distinct from p_date_confirmed
    or ev.program_type is distinct from p_program or ev.target_grade is distinct from p_target then raise exception 'Examen preparado no válido'; end if;
  update exam_events set call_month=p_call_month where id=ev.id;
  insert into exam_call_grade_groups(call_month,program_type,target_grade,event_id) values(p_call_month,p_program,p_target,ev.id);
  chosen:=ev.id;
 else
  select * into ev from exam_events where id=chosen for update;
  if not exam_group_is_unstarted(chosen) then raise exception 'El examen de este grado ya está iniciado o cerrado'; end if;
  if p_date_confirmed and (not ev.date_confirmed or ev.exam_date is distinct from p_exam_date) then raise exception 'Confirma o modifica el día del examen compartido desde Exámenes'; end if;
 end if;
 return jsonb_build_object('eventId',chosen,'examDate',ev.exam_date,'dateConfirmed',ev.date_confirmed);
end $$;

create or replace function public.exam_child_scope_rank(p_grade text) returns integer
language sql immutable as $$
 select case replace(replace(translate(upper(trim(coalesce(p_grade,''))),'ÁÉÍÓÚ','AEIOU'),' Y ','-'),' ','-')
 when 'MINARAI' then 0 when 'BLANCO' then 0 when 'BLANCO-AMARILLO' then 1 when 'AMARILLO' then 2
 when 'AMARILLO-NARANJA' then 3 when 'NARANJA' then 4 when 'NARANJA-VERDE' then 5 when 'VERDE' then 6
 when 'VERDE-AZUL' then 7 when 'AZUL' then 8 when 'AZUL-MARRON' then 9 when 'MARRON' then 10 when '1-DAN' then 11 else -1 end;
$$;
create or replace function public.exam_group_item_in_scope(p_program text,p_target text,p_grade text) returns boolean
language sql immutable as $$
 select coalesce(trim(p_grade),'')='' or case when p_program in ('kids','kids_progressive')
 then exam_child_scope_rank(p_grade)>=0 and exam_child_scope_rank(p_grade)<=exam_child_scope_rank(p_target)
 else upper(trim(p_grade))=upper(trim(p_target)) end;
$$;
create or replace function public.exam_group_item_signature(p_event uuid,p_program text,p_target text) returns jsonb
language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(item order by order_index,item::text),'[]'::jsonb) from (
 select order_index,jsonb_build_array(source,technique_id,child_syllabus_item_id,section,name,summary,grade,category,weight,cut_grade,active) item
 from exam_event_items where exam_event_id=p_event and exam_group_item_in_scope(p_program,p_target,grade)) scoped;
$$;

-- Used for legacy mixed preparations and as an atomic safety check on acceptance.
create or replace function public.ensure_invitation_exam_grade_group(p_invitation_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.exam_invitations; src public.exam_events; dest public.exam_events; chosen uuid; month_key text; target text;
 source_id uuid; locked_events uuid[]; other record; ex record; new_ex uuid; scopes jsonb:='{}'; pending jsonb:='[]'; settings jsonb; free_text text;
begin
 select * into inv from exam_invitations where id=p_invitation_id;
 if not found then raise exception 'Invitación no encontrada'; end if;
 select * into src from exam_events where id=inv.exam_event_id;
 month_key:=coalesce(inv.snapshot->>'callMonth',to_char(inv.call_key,'YYYY-MM')); target:=inv.snapshot->>'targetGrade';
 if coalesce(target,'')='' then raise exception 'Falta grado objetivo'; end if;
 perform pg_advisory_xact_lock(hashtext(month_key||':'||src.program_type||':'||target));
 select event_id into chosen from exam_call_grade_groups where call_month=month_key and program_type=src.program_type and target_grade=target;
 select array_agg(id) into locked_events from (
  select e.id from exam_invitations i join exam_events e on e.id=i.exam_event_id where to_char(i.call_key,'YYYY-MM')=month_key and e.program_type=src.program_type and i.snapshot->>'targetGrade'=target
  union select src.id union select chosen where chosen is not null
 ) sources;
 perform 1 from exam_events where id=any(locked_events) order by id for update;
 select * into src from exam_events where id=inv.exam_event_id;
 -- Source scores/status are checked only after every relevant event row is locked.

 if chosen is null then
  if not exam_group_is_unstarted(src.id) then raise exception 'El examen anterior ya está iniciado o cerrado'; end if;
  if src.target_grade=target and not exists(select 1 from exam_invitations where exam_event_id=src.id and (snapshot->>'targetGrade') is distinct from target) then
   chosen:=src.id;
  else
   insert into exam_events(title,exam_date,program_type,pass_percentage,status,notes,created_by,call_date,call_month,is_retake,date_confirmed,target_grade)
   values(src.title||' · '||target,src.exam_date,src.program_type,src.pass_percentage,'active',null,src.created_by,src.call_date,month_key,src.is_retake,src.date_confirmed,target) returning id into chosen;
   insert into exam_event_items(exam_event_id,source,technique_id,child_syllabus_item_id,section,name,summary,grade,category,weight,order_index,cut_grade,active)
   select chosen,source,technique_id,child_syllabus_item_id,section,name,summary,grade,category,weight,order_index,cut_grade,active from exam_event_items
   where exam_event_id=src.id and exam_group_item_in_scope(src.program_type,target,grade);
   if not exists(select 1 from exam_event_items where exam_event_id=chosen and active and source<>'cut' and weight>0) then raise exception 'No hay temario del grado objetivo para preparar el grupo'; end if;
   begin settings:=src.notes::jsonb; exception when others then settings:=null; end;
   free_text:=case when settings->>'examAssignmentsVersion'='1' then settings->>'text' else src.notes end;
   for ex in select * from exam_event_examiners where exam_event_id=src.id and revoked_at is null order by created_at,id loop
    if src.program_type in ('adults','dan_tribunal') and settings->'scopes' is not null and not coalesce(settings->'scopes'->ex.id::text ? target,false) then continue; end if;
    insert into exam_event_examiners(exam_event_id,name,email,source_examiner_id) values(chosen,ex.name,ex.email,ex.id) returning id into new_ex;
    scopes:=scopes||jsonb_build_object(new_ex::text,jsonb_build_array(target));
    if coalesce(settings->'pendingExaminerIds' ? ex.id::text,false) then pending:=pending||jsonb_build_array(new_ex::text); end if;
   end loop;
   if scopes='{}'::jsonb then
    insert into exam_event_examiners(exam_event_id,name) values(chosen,'Pendiente · '||target) returning id into new_ex;
    scopes:=jsonb_build_object(new_ex::text,jsonb_build_array(target)); pending:=jsonb_build_array(new_ex::text);
   end if;
   update exam_events set notes=jsonb_build_object('examAssignmentsVersion',1,'text',coalesce(free_text,''),'scopes',scopes,'gradeGroupMode',src.program_type in ('adults','dan_tribunal'),'pendingExaminerIds',pending)::text where id=chosen;
  end if;
  update exam_events set call_month=month_key,target_grade=target where id=chosen;
  insert into exam_call_grade_groups(call_month,program_type,target_grade,event_id) values(month_key,src.program_type,target,chosen);
 end if;
 select * into dest from exam_events where id=chosen for update;
 if not exam_group_is_unstarted(chosen) then raise exception 'El examen del grupo ya está iniciado o cerrado'; end if;
 -- Never discard a teacher's different manual syllabus while merging old preparations.
 for other in select distinct e.id,e.exam_date,e.date_confirmed from exam_invitations i join exam_events e on e.id=i.exam_event_id
  where to_char(i.call_key,'YYYY-MM')=month_key and e.program_type=src.program_type and i.snapshot->>'targetGrade'=target and e.id<>chosen loop
  if not exam_group_is_unstarted(other.id) or other.exam_date is distinct from dest.exam_date or other.date_confirmed is distinct from dest.date_confirmed then raise exception 'Otro examen del grupo tiene fecha distinta o ya está iniciado'; end if;
  if exam_group_item_signature(other.id,src.program_type,target) is distinct from exam_group_item_signature(chosen,src.program_type,target) then raise exception 'Hay diferencias de temario manual entre exámenes; revisa el grupo'; end if;
 end loop;
 -- A duplicate old reservation is safe to remove only after the no-evaluation checks above.
 delete from exam_event_students old where old.exam_event_id<>chosen and exists(select 1 from exam_event_students dest_student where dest_student.exam_event_id=chosen and dest_student.member_id=old.member_id)
 and exists(select 1 from exam_invitations i join exam_events e on e.id=i.exam_event_id where i.exam_event_id=old.exam_event_id and i.member_id=old.member_id and to_char(i.call_key,'YYYY-MM')=month_key and e.program_type=src.program_type and i.snapshot->>'targetGrade'=target);
 update exam_event_students st set exam_event_id=chosen where st.exam_event_id<>chosen and exists(select 1 from exam_invitations i join exam_events e on e.id=i.exam_event_id where i.exam_event_id=st.exam_event_id and i.member_id=st.member_id and to_char(i.call_key,'YYYY-MM')=month_key and e.program_type=src.program_type and i.snapshot->>'targetGrade'=target);
 update exam_event_reviews r set exam_event_id=chosen where r.exam_event_id<>chosen and exists(select 1 from exam_event_students st where st.id=r.event_student_id and st.exam_event_id=chosen);
 update exam_invitations i set exam_event_id=chosen from exam_events e where e.id=i.exam_event_id and to_char(i.call_key,'YYYY-MM')=month_key and e.program_type=src.program_type and i.snapshot->>'targetGrade'=target;
 update exam_events set updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond') where id=any(locked_events) or id=chosen;
 update exam_events e set status='archived' where e.id=any(locked_events) and e.id<>chosen and not exists(select 1 from exam_call_grade_groups where event_id=e.id) and not exists(select 1 from exam_invitations where exam_event_id=e.id) and not exists(select 1 from exam_event_students where exam_event_id=e.id);
 return chosen;
end $$;

create or replace function public.respond_exam_invitation(p_hash text,p_response text,p_message text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.exam_invitations; ev public.exam_events; mem public.members; group_program text;
begin
 if p_response is null or p_response not in ('accepted','deferred') or length(coalesce(p_message,''))>2000 then raise exception 'Respuesta inválida'; end if;
 select * into inv from exam_invitations where token_hash=p_hash;
 if not found then raise exception 'Invitación no disponible'; end if;
 select program_type into group_program from exam_events where id=inv.exam_event_id;
 perform pg_advisory_xact_lock(hashtext(coalesce(inv.snapshot->>'callMonth',to_char(inv.call_key,'YYYY-MM'))||':'||group_program||':'||(inv.snapshot->>'targetGrade')));
 select * into inv from exam_invitations where token_hash=p_hash for update;
 if not found or inv.revoked_at is not null or inv.teacher_approved_at is null or inv.teacher_approved_by is null
    or inv.expires_at<=now() then raise exception 'Invitación no disponible'; end if;
 if p_response='accepted' and inv.response is null then
  perform ensure_invitation_exam_grade_group(inv.id);
  select * into inv from exam_invitations where id=inv.id;
 end if;
 select * into ev from exam_events where id=inv.exam_event_id for update;
 select * into mem from members where id=inv.member_id for share;
 if ev.id is null or ev.status not in ('active','draft') or ev.exam_date is distinct from inv.teacher_approved_exam_date
    or ev.exam_date<=(now() at time zone 'Europe/Madrid')::date
    or mem.id is null or mem.status<>'active' or mem.grade is distinct from (inv.snapshot->>'currentGrade')
    or mem.class::text is distinct from (inv.snapshot->>'memberClass') then raise exception 'Autorización no vigente'; end if;
 if inv.response is not null then
   if inv.response=p_response then return inv.id; end if;
   raise exception 'La respuesta ya está registrada';
 end if;
 if p_response='accepted' then
  insert into exam_event_students(exam_event_id,member_id,display_order,current_grade,target_grade)
  values(inv.exam_event_id,inv.member_id,(select coalesce(max(display_order),0)+1 from exam_event_students where exam_event_id=inv.exam_event_id),inv.snapshot->>'currentGrade',inv.snapshot->>'targetGrade')
  on conflict(exam_event_id,member_id) do nothing;
 end if;
 update exam_invitations set response=p_response,message=coalesce(p_message,''),responded_at=now() where id=inv.id;
 return inv.id;
end $$;


create or replace function public.replace_exam_invitation_drafts(p_call date,p_member_ids uuid[],p_rows jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare old_events uuid[]; old_batches uuid[]; lock_key text;
begin
 for lock_key in
  select distinct keys.key from (
   select to_char(p_call,'YYYY-MM')||':'||e.program_type||':'||(item->'snapshot'->>'targetGrade') key from jsonb_array_elements(p_rows) item join exam_events e on e.id=(item->>'exam_event_id')::uuid
   union select to_char(i.call_key,'YYYY-MM')||':'||e.program_type||':'||(i.snapshot->>'targetGrade') key from exam_invitations i join exam_events e on e.id=i.exam_event_id where i.call_key=p_call and i.member_id=any(p_member_ids) and i.delivery_status in ('draft','failed') and i.response is null
  ) keys order by keys.key loop perform pg_advisory_xact_lock(hashtext(lock_key)); end loop;
 perform pg_advisory_xact_lock(hashtext(p_call::text));
 if jsonb_array_length(p_rows)<>cardinality(p_member_ids) then raise exception 'Selección inválida'; end if;
 select array_agg(distinct exam_event_id),array_agg(distinct batch_id) into old_events,old_batches from exam_invitations
 where call_key=p_call and member_id=any(p_member_ids) and delivery_status in ('draft','failed') and response is null;
 delete from exam_invitations where call_key=p_call and member_id=any(p_member_ids) and delivery_status in ('draft','failed') and response is null;
 insert into exam_invitations(batch_id,call_key,member_id,exam_event_id,snapshot,subject,body,exam_fee,expires_at)
 select batch_id,call_key,member_id,exam_event_id,snapshot,subject,body,exam_fee,expires_at
 from jsonb_to_recordset(p_rows) as r(batch_id uuid,call_key date,member_id uuid,exam_event_id uuid,snapshot jsonb,subject text,body text,exam_fee integer,expires_at timestamptz);
 delete from exam_events e where e.id=any(old_events) and not exists(select 1 from exam_call_grade_groups g where g.event_id=e.id) and not exists(select 1 from exam_invitations i where i.exam_event_id=e.id) and not exists(select 1 from exam_event_students st where st.exam_event_id=e.id) and not exists(select 1 from exam_event_reviews r where r.exam_event_id=e.id);
 delete from exam_invitation_batches b where b.id=any(old_batches) and not exists(select 1 from exam_invitations i where i.batch_id=b.id);
end $$;
revoke all on function public.replace_exam_invitation_drafts(date,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.replace_exam_invitation_drafts(date,uuid[],jsonb) to service_role;
-- Explicit operator reconciliation: default is read-only. Started histories are never moved.
create or replace function public.reconcile_unstarted_invitation_grade_groups(p_apply boolean default false,p_source_event uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb:='[]'; group_row record; chosen uuid; group_status text;
begin
 for group_row in select to_char(i.call_key,'YYYY-MM') call_month,e.program_type,i.snapshot->>'targetGrade' target_grade,
   (array_agg(i.id order by e.created_at,i.id))[1] first_invitation,array_agg(distinct e.id) event_ids,count(*) filter(where i.response='accepted') accepted_count,count(*) participant_count,
   bool_and(exam_group_is_unstarted(e.id)) unstarted
  from exam_invitations i join exam_events e on e.id=i.exam_event_id where i.teacher_approved_at is not null and i.revoked_at is null and (p_source_event is null or i.exam_event_id=p_source_event)
  group by to_char(i.call_key,'YYYY-MM'),e.program_type,i.snapshot->>'targetGrade' loop
  chosen:=null; group_status:=case when group_row.unstarted then 'ready' else 'untouched_started' end;
  if p_apply and group_row.unstarted then
   begin
    chosen:=ensure_invitation_exam_grade_group(group_row.first_invitation); group_status:='reconciled';
   exception when others then group_status:='needs_review: '||sqlerrm; end;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('callMonth',group_row.call_month,'programType',group_row.program_type,'targetGrade',group_row.target_grade,'sourceEventIds',group_row.event_ids,'acceptedCount',group_row.accepted_count,'participantCount',group_row.participant_count,'status',group_status,'eventId',chosen));
 end loop;
 return result;
end $$;
revoke all on function public.claim_prepared_exam_grade_group(uuid,text,text,text,date,boolean),public.discard_unclaimed_exam_preparation(uuid),public.ensure_invitation_exam_grade_group(uuid),public.reconcile_unstarted_invitation_grade_groups(boolean,uuid),public.exam_group_is_unstarted(uuid),public.exam_group_item_signature(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_prepared_exam_grade_group(uuid,text,text,text,date,boolean),public.discard_unclaimed_exam_preparation(uuid),public.ensure_invitation_exam_grade_group(uuid),public.reconcile_unstarted_invitation_grade_groups(boolean,uuid),public.exam_group_is_unstarted(uuid),public.exam_group_item_signature(uuid,text,text) to service_role;
revoke all on function public.respond_exam_invitation(text,text,text) from public,anon,authenticated;
grant execute on function public.respond_exam_invitation(text,text,text) to service_role;

create or replace function public.approve_exam_invitation_batch(p_batch_id uuid,p_actor text,p_hashes jsonb,p_event_dates jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare inv public.exam_invitations; ev public.exam_events; mem public.members; n integer:=0; lock_key text;
begin
 for lock_key in select distinct coalesce(i.snapshot->>'callMonth',to_char(i.call_key,'YYYY-MM'))||':'||e.program_type||':'||(i.snapshot->>'targetGrade') from exam_invitations i join exam_events e on e.id=i.exam_event_id where i.batch_id=p_batch_id order by 1 loop perform pg_advisory_xact_lock(hashtext(lock_key)); end loop;
 if p_actor is null or length(trim(p_actor))=0 then raise exception 'Profesor requerido'; end if;
 for inv in select * from exam_invitations where batch_id=p_batch_id order by id for update loop
  select * into ev from exam_events where id=inv.exam_event_id for update;
  select * into mem from members where id=inv.member_id for share;
  if inv.revoked_at is not null or inv.expires_at<=now() or ev.id is null or ev.status not in ('active','draft')
    or ev.exam_date<=(now() at time zone 'Europe/Madrid')::date
    or ev.exam_date::text is distinct from (p_event_dates->>ev.id::text)
    or mem.id is null or mem.status<>'active' or mem.grade is distinct from (inv.snapshot->>'currentGrade')
    or mem.class::text is distinct from (inv.snapshot->>'memberClass')
    or coalesce(inv.snapshot->>'targetGrade','')='' then raise exception 'Convocatoria no autorizable'; end if;
  if inv.token_hash is null and coalesce(p_hashes->>inv.id::text,'') !~ '^[a-f0-9]{64}$' then raise exception 'Token inválido'; end if;
  update exam_invitations set teacher_approved_at=now(),teacher_approved_by=trim(p_actor),teacher_approved_exam_date=ev.exam_date,
    token_hash=coalesce(token_hash,p_hashes->>inv.id::text) where id=inv.id;
  n:=n+1;
 end loop;
 if n=0 then raise exception 'Convocatoria vacía'; end if;
end $$;


create or replace function public.confirm_planning_exam_date(
 p_event_id uuid,p_exam_date date,p_expected_date date,p_expected_month text,p_updates jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare ev public.exam_events; inv public.exam_invitations; mem public.members; payload jsonb; n integer:=0; lock_key text;
begin
 for lock_key in select distinct coalesce(i.snapshot->>'callMonth',to_char(i.call_key,'YYYY-MM'))||':'||e.program_type||':'||(i.snapshot->>'targetGrade') from exam_invitations i join exam_events e on e.id=i.exam_event_id where i.exam_event_id=p_event_id order by 1 loop perform pg_advisory_xact_lock(hashtext(lock_key)); end loop;
 -- Serialize with acceptance before taking invitation and event rows.
 perform id from exam_invitations where exam_event_id=p_event_id order by id for update;
 select * into ev from exam_events where id=p_event_id for update;
 if not found or ev.status not in ('active','draft')
   or ev.exam_date is distinct from p_expected_date or ev.call_month is distinct from p_expected_month
   or to_char(p_exam_date,'YYYY-MM') is distinct from ev.call_month
   or p_exam_date<(now() at time zone 'Europe/Madrid')::date then raise exception 'Día no confirmable'; end if;
 if exists(select 1 from exam_event_scores where exam_event_id=p_event_id)
   or exists(select 1 from exam_event_students where exam_event_id=p_event_id and (final_passed is not null or final_percentage is not null))
   or exists(select 1 from exam_event_examiners where exam_event_id=p_event_id and submitted_at is not null)
   then raise exception 'El examen ya contiene evaluaciones'; end if;
 for inv in select * from exam_invitations where exam_event_id=p_event_id order by id loop
  select * into mem from members where id=inv.member_id for share;
  payload:=p_updates->inv.id::text;
  if (inv.response is distinct from 'deferred' and (mem.id is null or mem.status<>'active' or mem.grade is distinct from (inv.snapshot->>'currentGrade')
    or mem.class::text is distinct from (inv.snapshot->>'memberClass'))) or payload is null
    or jsonb_typeof(payload->'deficits') is distinct from 'array' or coalesce(payload->>'reason','')=''
    or coalesce(payload->>'body','')='' then raise exception 'Participantes o preparación han cambiado'; end if;
  if inv.response is distinct from 'deferred' and inv.delivery_status not in ('draft','failed') then raise exception 'Una invitación mensual no debe haberse enviado'; end if;
  n:=n+1;
 end loop;
 if n=0 or (select count(*) from jsonb_object_keys(p_updates))<>n then raise exception 'Participantes han cambiado'; end if;
 update exam_events set exam_date=p_exam_date,date_confirmed=true,updated_at=now() where id=p_event_id;
 update exam_invitations set teacher_approved_exam_date=case when teacher_approved_at is not null then p_exam_date else teacher_approved_exam_date end,
   expires_at=(p_exam_date::timestamp at time zone 'Europe/Madrid'),
   snapshot=case when response='deferred' and delivery_status in ('sent','sending') then snapshot else snapshot||jsonb_build_object('examDate',p_exam_date::text,'dateConfirmed',true,'reason',p_updates->id::text->>'reason','deficits',p_updates->id::text->'deficits') end,
   body=case when response='deferred' and delivery_status in ('sent','sending') then body else p_updates->id::text->>'body' end
 where exam_event_id=p_event_id;
 -- Responses, messages, reservations, results and academic member fields are deliberately untouched.
end $$;
revoke all on function public.confirm_planning_exam_date(uuid,date,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_planning_exam_date(uuid,date,date,text,jsonb) to service_role;
