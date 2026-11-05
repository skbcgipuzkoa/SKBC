alter table public.exam_invitations
 add column teacher_approved_at timestamptz,
 add column teacher_approved_by text,
 add column teacher_approved_exam_date date;
-- Earlier explicit administrator sends retain their scoped authorisation.
update public.exam_invitations set teacher_approved_at=coalesce(sent_at,now()),
 teacher_approved_by='Administrador: envío anterior',teacher_approved_exam_date=(snapshot->>'examDate')::date
 where delivery_status in ('sent','sending') and revoked_at is null;

create or replace function public.approve_exam_invitation_batch(p_batch_id uuid,p_actor text,p_hashes jsonb,p_event_dates jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare inv public.exam_invitations; ev public.exam_events; mem public.members; n integer:=0;
begin
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

create or replace function public.respond_exam_invitation(p_hash text,p_response text,p_message text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.exam_invitations; ev public.exam_events; mem public.members;
begin
 if p_response is null or p_response not in ('accepted','deferred') or length(coalesce(p_message,''))>2000 then raise exception 'Respuesta inválida'; end if;
 select * into inv from exam_invitations where token_hash=p_hash for update;
 if not found or inv.revoked_at is not null or inv.teacher_approved_at is null or inv.teacher_approved_by is null
    or inv.expires_at<=now() then raise exception 'Invitación no disponible'; end if;
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

create or replace function public.respond_exam_invitation_from_ficha(p_ficha_token text,p_invitation_id uuid,p_response text,p_message text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare member_uuid uuid; inv public.exam_invitations;
begin
 if p_ficha_token is null or length(p_ficha_token)<16 then raise exception 'Ficha inválida'; end if;
 select id into member_uuid from members where ficha_token=p_ficha_token and status='active' for share;
 if not found then raise exception 'Ficha inválida'; end if;
 select * into inv from exam_invitations where id=p_invitation_id and member_id=member_uuid;
 if not found or inv.token_hash is null then raise exception 'Invitación no disponible'; end if;
 return respond_exam_invitation(inv.token_hash,p_response,p_message);
end $$;
revoke all on function public.approve_exam_invitation_batch(uuid,text,jsonb,jsonb),public.respond_exam_invitation(text,text,text),public.respond_exam_invitation_from_ficha(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.approve_exam_invitation_batch(uuid,text,jsonb,jsonb),public.respond_exam_invitation(text,text,text),public.respond_exam_invitation_from_ficha(text,uuid,text,text) to service_role;
