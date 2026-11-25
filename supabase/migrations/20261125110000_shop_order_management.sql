alter table public.shop_promotion_orders
  add column payment_status text not null default 'pending' check (payment_status in ('pending', 'bizum', 'cash')),
  add column delivery_status text not null default 'pending' check (delivery_status in ('pending', 'delivered')),
  add column paid_at timestamptz,
  add column delivered_at timestamptz,
  add column management_revision uuid not null default gen_random_uuid();

create function public.shop_update_order_management(
  p_id uuid, p_context_slug text, p_revision uuid, p_payment text, p_delivery text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_payment not in ('pending','bizum','cash') or p_delivery not in ('pending','delivered') then
    return false;
  end if;
  update public.shop_promotion_orders
    set payment_status = p_payment,
        delivery_status = p_delivery,
        paid_at = case when p_payment = 'pending' then null
          when payment_status = 'pending' then clock_timestamp() else paid_at end,
        delivered_at = case when p_delivery = 'pending' then null else coalesce(delivered_at, clock_timestamp()) end,
        management_revision = gen_random_uuid()
    where id = p_id and management_revision = p_revision
      and (promotion_slug = p_context_slug or offer_slug = p_context_slug);
  return found;
end;
$$;
revoke all on function public.shop_update_order_management(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.shop_update_order_management(uuid,text,uuid,text,text) to service_role;
