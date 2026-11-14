create function public.tag_gainberri_visit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.class_id is not null and exists (
    select 1 from public.classes c where c.id = new.class_id and c.dojo_slug = 'gainberri'
  ) then
    select r.visit_id into new.visit_id
    from public.dojo_class_roster('gainberri', new.class_id) r where r.member_id = new.member_id;
  end if;
  return new;
end;
$$;

create trigger tag_gainberri_visit
before insert or update of class_id, member_id on public.attendance_logs
for each row execute function public.tag_gainberri_visit();

create function public.attribute_visitor_progress()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.progress_dojo_slug is null then
    select v.origin_slug into new.progress_dojo_slug
    from public.attendance_logs a join public.dojo_visits v on v.id = a.visit_id
    where a.class_id = new.class_id and a.member_id = new.member_id
    order by a.id limit 1;
  end if;
  return new;
end;
$$;

create trigger attribute_visitor_progress
before insert on public.member_technical_history
for each row execute function public.attribute_visitor_progress();
