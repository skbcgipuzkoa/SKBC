alter table public.dojo_enrollment_requests add column profile jsonb not null default '{}'::jsonb;

create or replace function public.approve_dojo_enrollment(p_request uuid, p_existing uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  request public.dojo_enrollment_requests%rowtype;
  member uuid;
  profile public.members%rowtype;
begin
  select * into request from public.dojo_enrollment_requests where id = p_request for update;
  if not found then raise exception 'Solicitud no disponible'; end if;
  if request.approved_member is not null then return request.approved_member; end if;
  perform 1 from public.dojos where slug = request.dojo_slug and archived_at is null for share;
  if not found then raise exception 'Dojo archivado'; end if;
  if p_existing is null then
    profile := jsonb_populate_record(null::public.members, request.profile);
    insert into public.members(first_name,last_name,class,dojo,ika_id,status,grade,joined_on,birth_date,
      exam_history,site_url,family_email,guardian_name,guardian_phone,student_phone,address,
      free_trial_enabled,free_trial_started_on,free_trial_ends_on,ficha_token,photo_url)
    values (request.first_name,request.last_name,request.member_class,
      case when request.dojo_slug = 'anandi' then 'anandi' else 'gainberri' end,
      profile.ika_id,coalesce(profile.status,'active'),profile.grade,profile.joined_on,profile.birth_date,
      profile.exam_history,profile.site_url,profile.family_email,profile.guardian_name,profile.guardian_phone,
      profile.student_phone,profile.address,coalesce(profile.free_trial_enabled,false),profile.free_trial_started_on,
      profile.free_trial_ends_on,profile.ficha_token,profile.photo_url)
    returning id into member;
  else
    select id into member from public.members where id = p_existing and class = request.member_class;
    if not found then raise exception 'Ficha incompatible'; end if;
  end if;
  insert into public.dojo_memberships(member_id,dojo_slug,status,validated_at)
  values(member,request.dojo_slug,coalesce(profile.status,'active'),now())
  on conflict (member_id,dojo_slug) do update set status = excluded.status, validated_at = now();
  update public.dojo_enrollment_requests set approved_member = member where id = p_request;
  return member;
end;
$$;
revoke all on function public.approve_dojo_enrollment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_dojo_enrollment(uuid,uuid) to service_role;
