-- A month-only planning call uses a private month-end calculation anchor, never a confirmed day.
alter table public.exam_events add column date_confirmed boolean not null default true;

create or replace function public.confirm_planning_exam_date(
 p_event_id uuid,p_exam_date date,p_expected_date date,p_expected_month text,p_updates jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare ev public.exam_events; inv public.exam_invitations; mem public.members; payload jsonb; n integer:=0;
begin
 -- Keep the same invitation-before-event lock order as response and approval.
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
  if mem.id is null or mem.status<>'active' or mem.grade is distinct from (inv.snapshot->>'currentGrade')
    or mem.class::text is distinct from (inv.snapshot->>'memberClass') or payload is null
    or jsonb_typeof(payload->'deficits') is distinct from 'array' or coalesce(payload->>'reason','')=''
    or coalesce(payload->>'body','')='' then raise exception 'Participantes o preparación han cambiado'; end if;
  if inv.delivery_status not in ('draft','failed') then raise exception 'Una invitación mensual no debe haberse enviado'; end if;
  n:=n+1;
 end loop;
 if n=0 or (select count(*) from jsonb_object_keys(p_updates))<>n then raise exception 'Participantes han cambiado'; end if;
 update exam_events set exam_date=p_exam_date,date_confirmed=true,updated_at=now() where id=p_event_id;
 update exam_invitations set teacher_approved_exam_date=case when teacher_approved_at is not null then p_exam_date else teacher_approved_exam_date end,
   expires_at=(p_exam_date::timestamp at time zone 'Europe/Madrid'),
   snapshot=snapshot||jsonb_build_object('examDate',p_exam_date::text,'dateConfirmed',true,'reason',p_updates->id::text->>'reason','deficits',p_updates->id::text->'deficits'),
   body=p_updates->id::text->>'body'
 where exam_event_id=p_event_id;
 -- Responses, messages, reservations, results and academic member fields are deliberately untouched.
end $$;
revoke all on function public.confirm_planning_exam_date(uuid,date,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_planning_exam_date(uuid,date,date,text,jsonb) to service_role;

create or replace function public.guard_confirmed_exam_evaluation() returns trigger
language plpgsql set search_path=public as $$
declare confirmed boolean;
begin
 select date_confirmed into confirmed from exam_events where id=new.exam_event_id for update;
 if confirmed=false then
  raise exception 'Confirma el día real antes de evaluar';
 end if;
 return new;
end $$;
create trigger exam_scores_require_confirmed_date before insert or update on public.exam_event_scores
for each row execute function public.guard_confirmed_exam_evaluation();

create or replace function public.guard_confirmed_exam_completion() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='completed' and not new.date_confirmed then raise exception 'Confirma el día real antes de registrar resultados'; end if;
 return new;
end $$;
create trigger exam_completion_requires_confirmed_date before update of status on public.exam_events
for each row execute function public.guard_confirmed_exam_completion();
