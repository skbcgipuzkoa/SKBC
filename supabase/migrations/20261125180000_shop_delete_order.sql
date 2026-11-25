create function public.shop_delete_order(p_id uuid, p_context_slug text, p_revision uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shop_promotion_orders
    where id = p_id and management_revision = p_revision
      and (promotion_slug = p_context_slug or offer_slug = p_context_slug);
  return found;
end;
$$;

revoke all on function public.shop_delete_order(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.shop_delete_order(uuid, text, uuid) to service_role;
