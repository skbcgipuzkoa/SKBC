alter table public.shop_promotion_orders
  add column planned_payment_method text check (planned_payment_method in ('bizum', 'cash'));

create function public.shop_submit_order_with_payment_method(
  p_slug text, p_revision uuid, p_id uuid, p_customer text, p_contact text,
  p_notes text, p_lines jsonb, p_total bigint, p_discount boolean, p_hash text,
  p_offer_slug text, p_offer_revision uuid, p_member_id uuid, p_family_id uuid, p_payment_method text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  result text;
begin
  if p_payment_method is not null and p_payment_method not in ('bizum', 'cash') then
    return 'invalid';
  end if;
  result := public.shop_submit_named_order(p_slug, p_revision, p_id, p_customer, p_contact,
    p_notes, p_lines, p_total, p_discount, p_hash, p_offer_slug, p_offer_revision, p_member_id, p_family_id);
  if result = 'saved' and p_payment_method is not null then
    update public.shop_promotion_orders
    set planned_payment_method = p_payment_method
    where id = p_id and request_hash = p_hash and planned_payment_method is null;
  end if;
  return result;
end;
$$;
revoke all on function public.shop_submit_order_with_payment_method(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text, text, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_submit_order_with_payment_method(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text, text, uuid, uuid, uuid, text) to service_role;
