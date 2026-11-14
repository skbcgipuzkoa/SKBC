create function public.sensei_has_dojo(p_user uuid, p_slug text)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.dojo_senseis s
    join public.dojos d on d.slug = s.dojo_slug
    where s.user_id = p_user and s.dojo_slug = p_slug and d.archived_at is null
  );
$$;
revoke all on function public.sensei_has_dojo(uuid, text) from public, anon, authenticated;
grant execute on function public.sensei_has_dojo(uuid, text) to service_role;
