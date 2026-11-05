create table public.exam_invitation_batches (
 id uuid primary key default gen_random_uuid(), call_key text not null, exam_date date not null,
 instructions text not null default '', created_at timestamptz not null default now()
);
create table public.exam_invitations (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.exam_invitation_batches(id) on delete cascade,
 call_key date not null, member_id uuid not null references public.members(id), exam_event_id uuid not null references public.exam_events(id),
 token_hash text unique, snapshot jsonb not null, subject text not null, body text not null,
 delivery_status text not null default 'draft' check(delivery_status in ('draft','sending','sent','failed')),
 delivery_error text, sent_at timestamptz, response text check(response in ('accepted','deferred')), message text check(length(message)<=2000),
 responded_at timestamptz, expires_at timestamptz not null, revoked_at timestamptz,
 exam_fee integer not null check(exam_fee in (10,15)), belt_fee integer not null default 5 check(belt_fee=5),
 unique(batch_id,member_id), unique(call_key,member_id)
);
alter table public.exam_invitation_batches enable row level security;
alter table public.exam_invitations enable row level security;
revoke all on public.exam_invitation_batches, public.exam_invitations from anon, authenticated;
grant all on public.exam_invitation_batches, public.exam_invitations to service_role;
create or replace function public.respond_exam_invitation(p_hash text,p_response text,p_message text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.exam_invitations; ev public.exam_events;
begin
 if p_response not in ('accepted','deferred') or length(p_message)>2000 then raise exception 'Respuesta inválida'; end if;
 select * into inv from exam_invitations where token_hash=p_hash for update;
 if not found or inv.revoked_at is not null or inv.delivery_status not in ('sending','sent') then raise exception 'Invitación no disponible'; end if;
 if inv.response is not null then
   if inv.response=p_response then return inv.id; end if;
   raise exception 'La respuesta ya está registrada';
 end if;
 if inv.expires_at<=now() then raise exception 'Invitación caducada'; end if;
 select * into ev from exam_events where id=inv.exam_event_id for update;
 if ev.status not in ('active','draft') then raise exception 'Examen cerrado'; end if;
 if p_response='accepted' then
  insert into exam_event_students(exam_event_id,member_id,display_order,current_grade,target_grade)
  values(inv.exam_event_id,inv.member_id,(select coalesce(max(display_order),0)+1 from exam_event_students where exam_event_id=inv.exam_event_id), inv.snapshot->>'currentGrade',inv.snapshot->>'targetGrade')
  on conflict(exam_event_id,member_id) do nothing;
 end if;
 update exam_invitations set response=p_response,message=p_message,responded_at=now() where id=inv.id;
 return inv.id;
end $$;
revoke all on function public.respond_exam_invitation(text,text,text) from public,anon,authenticated;
grant execute on function public.respond_exam_invitation(text,text,text) to service_role;
alter table public.exam_events add column if not exists call_date date, add column if not exists is_retake boolean, add column if not exists call_month text;
-- Replace only unsent drafts atomically: failed preparation leaves the previous preview intact.
create or replace function public.replace_exam_invitation_drafts(p_call date,p_member_ids uuid[],p_rows jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare old_events uuid[]; old_batches uuid[];
begin
 perform pg_advisory_xact_lock(hashtext(p_call::text));
 if jsonb_array_length(p_rows)<>cardinality(p_member_ids) then raise exception 'Selección inválida'; end if;
 select array_agg(distinct exam_event_id),array_agg(distinct batch_id) into old_events,old_batches from exam_invitations
 where call_key=p_call and member_id=any(p_member_ids) and delivery_status in ('draft','failed') and response is null;
 delete from exam_invitations where call_key=p_call and member_id=any(p_member_ids) and delivery_status in ('draft','failed') and response is null;
 insert into exam_invitations(batch_id,call_key,member_id,exam_event_id,snapshot,subject,body,exam_fee,expires_at)
 select batch_id,call_key,member_id,exam_event_id,snapshot,subject,body,exam_fee,expires_at
 from jsonb_to_recordset(p_rows) as r(batch_id uuid,call_key date,member_id uuid,exam_event_id uuid,snapshot jsonb,subject text,body text,exam_fee integer,expires_at timestamptz);
 delete from exam_events e where e.id=any(old_events) and not exists(select 1 from exam_invitations i where i.exam_event_id=e.id) and not exists(select 1 from exam_event_students st where st.exam_event_id=e.id) and not exists(select 1 from exam_event_reviews r where r.exam_event_id=e.id);
 delete from exam_invitation_batches b where b.id=any(old_batches) and not exists(select 1 from exam_invitations i where i.batch_id=b.id);
end $$;
revoke all on function public.replace_exam_invitation_drafts(date,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.replace_exam_invitation_drafts(date,uuid[],jsonb) to service_role;
-- Edit the planned actual date and its default response deadline together.
create or replace function public.update_exam_invitation_event(p_id uuid,p_title text,p_date date,p_notes text,p_expiry timestamptz) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from exam_events where id=p_id and status='active' for update;
 if not found or length(trim(p_title))=0 then raise exception 'Examen no editable'; end if;
 update exam_events set title=p_title,exam_date=p_date,notes=p_notes,updated_at=now(),
 call_month=case when is_retake=false and extract(month from p_date)<=2 then to_char(p_date-interval '1 year','YYYY')||'-12' else to_char(p_date,'YYYY-MM') end where id=p_id;
 update exam_invitations set expires_at=p_expiry where exam_event_id=p_id and response is null and revoked_at is null;
end $$;
revoke all on function public.update_exam_invitation_event(uuid,text,date,text,timestamptz) from public,anon,authenticated;
grant execute on function public.update_exam_invitation_event(uuid,text,date,text,timestamptz) to service_role;
