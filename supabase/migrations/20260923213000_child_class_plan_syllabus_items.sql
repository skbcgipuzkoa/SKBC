alter table public.child_class_plans
  add column if not exists syllabus_item_ids uuid[] not null default '{}'::uuid[];

