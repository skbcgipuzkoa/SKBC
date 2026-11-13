alter table public.members
  add column dojo text not null default 'gainberri',
  add constraint members_dojo_class_check
    check (dojo = 'gainberri' or (dojo = 'anandi' and class = 'adults'));
