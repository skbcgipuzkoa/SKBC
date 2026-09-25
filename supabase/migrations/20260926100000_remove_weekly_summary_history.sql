delete from public.notification_deliveries
where channel = 'panel'
  and delivery_key like 'weekly:%';

drop table if exists public.weekly_summaries;
