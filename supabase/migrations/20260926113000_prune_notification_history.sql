delete from public.email_notification_logs
where created_at < now() - interval '90 days'
  and status = 'sent';

delete from public.telegram_notification_logs
where created_at < now() - interval '30 days'
  and status in ('sent', 'skipped');

delete from public.notification_deliveries
where created_at < now() - interval '30 days'
  and status = 'sent';
