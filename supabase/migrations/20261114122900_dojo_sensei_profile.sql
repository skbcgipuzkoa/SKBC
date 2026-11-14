alter table public.dojos
  add column sensei_member_id uuid references public.members(id) on delete set null,
  add column sensei_photo_url text;
