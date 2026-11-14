insert into public.dojos (slug, name, accent_color) values
  ('gainberri', 'Gainberri Tolosa', '#2563EB'),
  ('anandi', 'Anandi Tolosa', '#0F6666');

insert into public.dojo_groups (dojo_slug, member_class) values
  ('gainberri', 'kids'), ('gainberri', 'adults'), ('anandi', 'adults');

insert into public.dojo_memberships (member_id, dojo_slug, status, validated_at)
select id, dojo, status, now() from public.members;

alter table public.classes add constraint classes_dojo_group_fkey
  foreign key (dojo_slug, class_group) references public.dojo_groups (dojo_slug, member_class);

alter table public.classes add constraint classes_dojo_fkey
  foreign key (dojo_slug) references public.dojos(slug);
