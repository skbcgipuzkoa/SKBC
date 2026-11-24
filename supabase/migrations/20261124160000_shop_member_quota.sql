alter table public.shop_promotion_orders
  add column member_id uuid references public.members(id) on delete set null,
  add column family_unit_id uuid references public.family_units(id) on delete set null,
  add column quota_slug text references public.shop_promotions(slug),
  add column promo_units integer not null default 0 check (promo_units between 0 and 5);

create index shop_promotion_orders_quota on public.shop_promotion_orders (quota_slug, member_id)
  where quota_slug is not null;

create function public.shop_submit_promotion_order(
  p_slug text, p_revision uuid, p_id uuid, p_customer text, p_contact text,
  p_notes text, p_lines jsonb, p_total bigint, p_discount boolean, p_hash text, p_offer_slug text, p_offer_revision uuid, p_member_id uuid, p_family_id uuid
) returns text language plpgsql set search_path = '' as $$
declare
  promotion public.shop_promotions%rowtype;
  existing_hash text;
  offer public.shop_promotions%rowtype;
  family_id uuid;
  promotion_quota text;
  requested bigint;
  consumed bigint;
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
  if p_member_id is not null then
    perform 1 from public.members
      where id = p_member_id and status = 'active' and class in ('adults', 'kids') for share;
    if not found then return 'member'; end if;
    select family_unit_id into family_id from public.family_unit_members where member_id = p_member_id for share;
    if family_id is distinct from p_family_id then return 'member'; end if;
  elsif p_slug <> 'tienda-general' or p_discount then
    return 'member';
  end if;

  if p_discount then
    promotion_quota := coalesce(p_offer_slug, p_slug);
    perform pg_advisory_xact_lock(hashtextextended(promotion_quota || ':' || p_member_id::text, 0));
    select request_hash into existing_hash from public.shop_promotion_orders where id = p_id;
    if found then return case when existing_hash = p_hash then 'saved' else 'conflict' end; end if;
    if coalesce(offer.expires_at, promotion.expires_at) <= clock_timestamp() then return 'changed'; end if;
    select coalesce(sum((line->>'quantity')::bigint), 0) into requested
      from jsonb_array_elements(p_lines) line
      where p_offer_slug is null or line->>'offer' = promotion_quota;
    select coalesce(sum(orders.promo_units), 0) into consumed
      from public.shop_promotion_orders orders
      where orders.quota_slug = promotion_quota and orders.member_id = p_member_id;
    if consumed + requested > 5 then return 'limit'; end if;
  end if;
  insert into public.shop_promotion_orders
    (id, promotion_slug, customer, contact, notes, lines, total_cents, discount_applied, request_hash, offer_slug, member_id, family_unit_id, quota_slug, promo_units)
  values (p_id, p_slug, p_customer, p_contact, p_notes, p_lines, p_total, p_discount, p_hash, p_offer_slug, p_member_id, family_id, promotion_quota, coalesce(requested, 0))
  on conflict (id) do nothing;
  select request_hash into existing_hash from public.shop_promotion_orders where id = p_id;
  return case when existing_hash = p_hash then 'saved' else 'conflict' end;
end;
$$;
revoke all on function public.shop_submit_promotion_order(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.shop_submit_promotion_order(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text, text, uuid, uuid, uuid) to service_role;

-- Older deployments may continue to serve an old action. Allow only ordinary
-- catalogue orders through the compatibility signatures.
create or replace function public.shop_submit_promotion_order(
  p_slug text, p_revision uuid, p_id uuid, p_customer text, p_contact text,
  p_notes text, p_lines jsonb, p_total bigint, p_discount boolean, p_hash text, p_offer_slug text, p_offer_revision uuid
) returns text language sql set search_path = '' as $$
  select case when p_slug <> 'tienda-general' or p_discount or p_offer_slug is not null then 'changed'
    else public.shop_submit_promotion_order(p_slug, p_revision, p_id, p_customer, p_contact,
      p_notes, p_lines, p_total, false, p_hash, null, null, null, null)
  end;
$$;

create or replace function public.shop_submit_promotion_order(
  p_slug text, p_revision uuid, p_id uuid, p_customer text, p_contact text,
  p_notes text, p_lines jsonb, p_total bigint, p_discount boolean, p_hash text
) returns text language sql set search_path = '' as $$
  select public.shop_submit_promotion_order(p_slug, p_revision, p_id, p_customer, p_contact,
    p_notes, p_lines, p_total, p_discount, p_hash, null, null);
$$;
