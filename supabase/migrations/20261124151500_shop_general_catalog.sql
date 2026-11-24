create unique index shop_promotions_unique_code on public.shop_promotions (code)
where slug <> 'tienda-general';

insert into public.shop_promotions (slug, title, description, code, expires_at, variants)
values ('tienda-general', 'Tienda SKBC GIPUZKOA', 'Material del club', '', '1970-01-01 UTC', '[]');

create function public.shop_publish_catalog(p_slug text, p_revision uuid, p_variants uuid[])
returns boolean language plpgsql set search_path = '' as $$
declare
  promotion public.shop_promotions%rowtype;
  products jsonb;
begin
  if p_slug = 'tienda-general' or cardinality(p_variants) = 0 then return false; end if;
  perform 1 from public.shop_promotions where slug = 'tienda-general' for update;
  select * into promotion from public.shop_promotions where slug = p_slug for share;
  if not found or promotion.revision <> p_revision then return false; end if;
  select jsonb_agg(item order by position) into products
  from jsonb_array_elements(promotion.variants) with ordinality as items(item, position)
  where (item->>'id')::uuid = any(p_variants);
  if products is null or jsonb_array_length(products) <> cardinality(p_variants) then return false; end if;
  update public.shop_promotions
  set variants = coalesce((
    select jsonb_agg(item order by position)
    from jsonb_array_elements(variants) with ordinality as current_items(item, position)
    where not ((item->>'id')::uuid = any(p_variants))
  ), '[]') || products, revision = gen_random_uuid()
  where slug = 'tienda-general';
  return true;
end;
$$;

revoke all on function public.shop_publish_catalog(text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.shop_publish_catalog(text, uuid, uuid[]) to service_role;

alter table public.shop_promotion_orders add column offer_slug text references public.shop_promotions(slug);
create index shop_promotion_orders_offer on public.shop_promotion_orders (offer_slug, created_at desc, id) where offer_slug is not null;

create function public.shop_submit_promotion_order(
  p_slug text, p_revision uuid, p_id uuid, p_customer text, p_contact text,
  p_notes text, p_lines jsonb, p_total bigint, p_discount boolean, p_hash text, p_offer_slug text, p_offer_revision uuid
) returns text language plpgsql set search_path = '' as $$
declare
  promotion public.shop_promotions%rowtype;
  existing_hash text;
  offer public.shop_promotions%rowtype;
begin
  select * into promotion from public.shop_promotions where slug = p_slug for share;
  select request_hash into existing_hash from public.shop_promotion_orders where id = p_id;
  if found then
    return case when existing_hash = p_hash then 'saved' else 'conflict' end;
  end if;
  if promotion.slug is null or not promotion.active or promotion.revision <> p_revision
    or (p_discount and p_slug <> 'tienda-general' and promotion.expires_at <= clock_timestamp()) then
    return 'changed';
  end if;
  if p_offer_slug is not null then
    if p_slug <> 'tienda-general' or p_offer_slug = p_slug then return 'changed'; end if;
    select * into offer from public.shop_promotions where slug = p_offer_slug for share;
    if not found or not offer.active or offer.revision <> p_offer_revision or offer.expires_at <= clock_timestamp() then
      return 'changed';
    end if;
  end if;
  insert into public.shop_promotion_orders
    (id, promotion_slug, customer, contact, notes, lines, total_cents, discount_applied, request_hash, offer_slug)
  values (p_id, p_slug, p_customer, p_contact, p_notes, p_lines, p_total, p_discount, p_hash, p_offer_slug)
  on conflict (id) do nothing;
  select request_hash into existing_hash from public.shop_promotion_orders where id = p_id;
  return case when existing_hash = p_hash then 'saved' else 'conflict' end;
end;
$$;
revoke all on function public.shop_submit_promotion_order(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text, text, uuid) from public, anon, authenticated;
grant execute on function public.shop_submit_promotion_order(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text, text, uuid) to service_role;
