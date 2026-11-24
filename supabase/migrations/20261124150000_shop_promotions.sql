create table public.shop_promotions (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  description text not null,
  cover_image text not null default '',
  code text not null,
  expires_at timestamptz not null,
  variants jsonb not null,
  active boolean not null default true,
  revision uuid not null default gen_random_uuid()
);

create table public.shop_promotion_orders (
  id uuid primary key,
  promotion_slug text not null references public.shop_promotions(slug),
  customer text not null,
  contact text not null,
  notes text not null,
  lines jsonb not null,
  total_cents bigint not null check (total_cents >= 0),
  discount_applied boolean not null,
  request_hash text not null,
  created_at timestamptz not null default now()
);

create index shop_promotion_orders_recent on public.shop_promotion_orders (promotion_slug, created_at desc, id);
alter table public.shop_promotions enable row level security;
alter table public.shop_promotion_orders enable row level security;
revoke all on public.shop_promotions, public.shop_promotion_orders from anon, authenticated;
grant select, insert, update on public.shop_promotions to service_role;
grant select, insert on public.shop_promotion_orders to service_role;

create function public.shop_submit_promotion_order(
  p_slug text, p_revision uuid, p_id uuid, p_customer text, p_contact text,
  p_notes text, p_lines jsonb, p_total bigint, p_discount boolean, p_hash text
) returns text language plpgsql set search_path = '' as $$
declare
  promotion public.shop_promotions%rowtype;
  existing_hash text;
begin
  select * into promotion from public.shop_promotions where slug = p_slug for share;
  select request_hash into existing_hash from public.shop_promotion_orders where id = p_id;
  if found then
    return case when existing_hash = p_hash then 'saved' else 'conflict' end;
  end if;
  if promotion.slug is null or not promotion.active or promotion.revision <> p_revision
    or (p_discount and promotion.expires_at <= clock_timestamp()) then
    return 'changed';
  end if;
  insert into public.shop_promotion_orders
    (id, promotion_slug, customer, contact, notes, lines, total_cents, discount_applied, request_hash)
  values (p_id, p_slug, p_customer, p_contact, p_notes, p_lines, p_total, p_discount, p_hash)
  on conflict (id) do nothing;
  select request_hash into existing_hash from public.shop_promotion_orders where id = p_id;
  return case when existing_hash = p_hash then 'saved' else 'conflict' end;
end;
$$;
revoke all on function public.shop_submit_promotion_order(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.shop_submit_promotion_order(text, uuid, uuid, text, text, text, jsonb, bigint, boolean, text) to service_role;
