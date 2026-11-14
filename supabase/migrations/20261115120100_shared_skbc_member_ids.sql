create function public.assign_skbc_member_id()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(617921, 1);
  if new.legacy_id is null or btrim(new.legacy_id) = '' then
    select (coalesce(max(btrim(legacy_id)::numeric), 0) + 1)::text
      into new.legacy_id
      from public.members
      where btrim(legacy_id) ~ '^[0-9]+$';
  end if;
  return new;
end;
$$;

create trigger assign_skbc_member_id_before_insert
before insert on public.members
for each row execute function public.assign_skbc_member_id();
