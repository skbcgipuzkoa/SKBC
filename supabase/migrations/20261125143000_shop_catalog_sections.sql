create function public.shop_publish_catalog(p_slug text, p_revision uuid, p_variants uuid[], p_section text)
returns boolean language plpgsql set search_path = '' as $$
declare
  promotion public.shop_promotions%rowtype;
  products jsonb;
begin
  if p_slug = 'tienda-general' or cardinality(p_variants) = 0
    or p_section is null or p_section not in ('gi', 'belt', 'club', 'other') then return false; end if;
  perform 1 from public.shop_promotions where slug = 'tienda-general' for update;
  select * into promotion from public.shop_promotions where slug = p_slug for share;
  if not found or promotion.revision <> p_revision then return false; end if;
  select jsonb_agg(item || jsonb_build_object('section', p_section) order by position) into products
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

revoke all on function public.shop_publish_catalog(text, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.shop_publish_catalog(text, uuid, uuid[], text) to service_role;
