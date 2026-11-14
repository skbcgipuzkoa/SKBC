begin;
create table public.dojo_events (
  id uuid primary key default gen_random_uuid(),
  dojo_slug text not null,
  dojo_name text not null,
  event_on date not null,
  kind text not null,
  summary text not null
);
create index dojo_events_date_idx on public.dojo_events(event_on);
create unique index dojo_events_one_opening on public.dojo_events(dojo_slug) where kind = 'opening';
alter table public.dojo_events enable row level security;
revoke all on public.dojo_events from public, anon, authenticated;
grant select on public.dojo_events to service_role;

create function public.record_dojo_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_date date := (now() at time zone 'Europe/Madrid')::date;
  changes text[];
begin
  if new.slug <> 'gainberri' and new.archived_at is null
     and new.operational_status = 'active' and new.opened_on is not null then
    insert into public.dojo_events(dojo_slug,dojo_name,event_on,kind,summary)
    values (new.slug,new.name,new.opened_on,'opening',
      'Apertura de ' || new.name || coalesce(' en ' || new.location,'')
      || coalesce(' · ' || new.opening_members || ' kenshis',''))
    on conflict (dojo_slug) where kind = 'opening' do nothing;
  end if;

  if tg_op = 'INSERT' then
    insert into public.dojo_events(dojo_slug,dojo_name,event_on,kind,summary)
    values (new.slug,new.name,event_date,'registration','Alta de ' || new.name || ' en el sistema');
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at then return new; end if;

  changes := array_remove(array[
    case when new.operational_status is distinct from old.operational_status then
      'Estado: ' || case new.operational_status when 'active' then 'Activo'
        when 'inactive' then 'Inactivo' when 'paused' then 'En pausa' else 'En construcción' end end,
    case when new.sensei is distinct from old.sensei or new.sensei_member_id is distinct from old.sensei_member_id
      then 'Sensei: ' || coalesce(new.sensei,'sin asignar') end,
    case when new.name is distinct from old.name then 'Nombre anterior: ' || old.name end,
    case when new.location is distinct from old.location then 'Ubicación actualizada' end,
    case when new.training_schedule is distinct from old.training_schedule then 'Horarios actualizados' end,
    case when new.opened_on is distinct from old.opened_on then 'Fecha de apertura actualizada' end,
    case when new.opening_members is distinct from old.opening_members then 'Número de kenshis en la apertura actualizado' end,
    case when new.accent_color is distinct from old.accent_color then 'Color actualizado' end,
    case when new.contact is distinct from old.contact then 'Contacto actualizado' end,
    case when new.sensei_photo_url is distinct from old.sensei_photo_url then 'Foto del sensei actualizada' end,
    case when new.notes is distinct from old.notes then 'Notas actualizadas' end
  ], null);
  if cardinality(changes) > 0 then
    insert into public.dojo_events(dojo_slug,dojo_name,event_on,kind,summary)
    values (new.slug,new.name,event_date,'change',new.name || ' · ' || array_to_string(changes,' · '));
  end if;
  return new;
end;
$$;
revoke all on function public.record_dojo_event() from public, anon, authenticated;
create trigger dojo_events_after_change after insert or update on public.dojos
for each row execute function public.record_dojo_event();

insert into public.dojo_events(dojo_slug,dojo_name,event_on,kind,summary)
select slug,name,opened_on,'opening','Apertura de ' || name || coalesce(' en ' || location,'')
  || coalesce(' · ' || opening_members || ' kenshis','')
from public.dojos where slug <> 'gainberri' and archived_at is null and operational_status = 'active' and opened_on is not null;
commit;
