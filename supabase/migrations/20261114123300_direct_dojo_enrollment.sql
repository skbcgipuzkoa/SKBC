create function public.create_dojo_kenshi(p_slug text, p_profile jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare
  profile public.members%rowtype;
  member uuid;
begin
  profile := jsonb_populate_record(null::public.members, p_profile);
  perform 1 from public.dojos
    where slug = p_slug and archived_at is null for share;
  if not found then raise exception 'Dojo archivado o inexistente'; end if;
  perform 1 from public.dojo_groups
    where dojo_slug = p_slug and member_class = profile.class;
  if not found then raise exception 'El dojo no admite esta clase'; end if;

  insert into public.members(legacy_id,first_name,last_name,class,dojo,ika_id,status,grade,joined_on,birth_date,
    exam_history,site_url,family_email,guardian_name,guardian_phone,student_phone,address,
    free_trial_enabled,free_trial_started_on,free_trial_ends_on,ficha_token,photo_url)
  values(profile.legacy_id,profile.first_name,profile.last_name,profile.class,p_slug,profile.ika_id,
    profile.status,profile.grade,profile.joined_on,profile.birth_date,profile.exam_history,profile.site_url,
    profile.family_email,profile.guardian_name,profile.guardian_phone,profile.student_phone,profile.address,
    profile.free_trial_enabled,profile.free_trial_started_on,profile.free_trial_ends_on,profile.ficha_token,profile.photo_url)
  returning id into member;

  insert into public.dojo_memberships(member_id,dojo_slug,status,validated_at)
  values(member,p_slug,profile.status,now());
  return member;
end;
$$;
revoke all on function public.create_dojo_kenshi(text,jsonb) from public, anon, authenticated;
grant execute on function public.create_dojo_kenshi(text,jsonb) to service_role;

create function public.set_home_dojo_kenshi_status(p_slug text, p_member uuid, p_active boolean)
returns void language plpgsql set search_path = '' as $$
declare
  member_class public.member_class;
  new_status public.member_status := case when p_active then 'active'::public.member_status else 'inactive'::public.member_status end;
begin
  perform 1 from public.dojos where slug = p_slug and archived_at is null for share;
  if not found then raise exception 'Dojo archivado o inexistente'; end if;
  lock table public.dojo_memberships in row exclusive mode;
  select m.class into member_class from public.members m
    where m.id = p_member and m.dojo = p_slug for update;
  if not found then raise exception 'El kenshi no pertenece a este dojo'; end if;
  if p_active and not exists (
    select 1 from public.dojo_groups g where g.dojo_slug = p_slug and g.member_class = member_class
  ) then raise exception 'El dojo no admite esta clase'; end if;

  insert into public.dojo_memberships(member_id,dojo_slug,status,validated_at)
  values(p_member,p_slug,new_status,now())
  on conflict (member_id,dojo_slug) do update set status = excluded.status;
  update public.members set status = new_status, updated_at = now() where id = p_member;
end;
$$;
revoke all on function public.set_home_dojo_kenshi_status(text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_home_dojo_kenshi_status(text,uuid,boolean) to service_role;
