"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveClubMember, listClubMembers } from "@/lib/shop/club-access";
import { getCatalogOffer, getPromotion, type Promotion } from "@/lib/shop/repository";
import { generalShopSlug, quotePromotion, type Selection } from "@/lib/shop/promotion";

const basketSchema = z.object({
  slug: z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  code: z.string().max(50),
  selection: z.array(z.object({ id: z.string().uuid(), quantity: z.number().int().positive().max(2147483647) })).max(200)
});

async function priceBasket(promotion: Promotion, code: string, selection: Selection[]) {
  if (promotion.slug !== generalShopSlug) return { quote: quotePromotion(promotion, code, selection), offer: null };
  const offer = await getCatalogOffer(code);
  if (!offer) return { quote: quotePromotion(promotion, code, selection), offer };
  const prices = new Map(offer.variants.map(variant => [variant.id, variant.offer]));
  const variants = promotion.variants.map(variant => ({
    ...variant, offer: Math.min(variant.original, prices.get(variant.id) ?? variant.original)
  }));
  return { quote: quotePromotion({ ...offer, variants }, code, selection), offer };
}

export async function promotionQuote(input: unknown) {
  const basket = basketSchema.omit({ selection: true }).parse(input);
  const promotion = await getPromotion(basket.slug);
  if (!promotion?.active) throw new Error("Promoción no disponible.");
  const { quote, offer } = await priceBasket(promotion, basket.code, promotion.variants.map(({ id }) => ({ id, quantity: 1 })));
  const eligible = new Set(offer?.variants.map(variant => variant.id));
  return {
    revision: promotion.revision,
    offerRevision: offer?.revision ?? null,
    status: quote.status,
    total: quote.total,
    lines: quote.lines.map(({ id, price, quantity }) => ({ id, price, quantity, eligible: eligible.has(id) }))
  };
}

export async function promotionClubMembers(input: unknown) {
  const parsed = basketSchema.pick({ slug: true, code: true }).safeParse(input);
  if (!parsed.success) return [];
  const { slug, code } = parsed.data;
  if (slug === generalShopSlug) {
    const offer = await getCatalogOffer(code);
    if (!offer || Date.parse(offer.expires_at) <= Date.now()) return [];
  } else if (!(await getPromotion(slug))?.active) {
    return [];
  }
  return (await listClubMembers()).map(({ id, display_name, class: group }) => ({ id, display_name, class: group }));
}

const checkoutSchema = basketSchema.extend({
  id: z.string().uuid(),
  revision: z.string().uuid(),
  offerRevision: z.string().uuid().nullable(),
  total: z.number().int().nonnegative().safe(),
  status: z.enum(["none", "invalid", "expired", "applied"]),
  customer: z.string().trim().max(160),
  memberId: z.string().uuid().or(z.literal("")).optional(),
  contact: z.string().trim().max(160),
  notes: z.string().trim().max(1000)
});

export async function submitPromotion(input: unknown) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success || !parsed.data.selection.length) return "invalid";
  const { id, slug, revision, offerRevision, total, status, code, selection, customer, contact, notes, memberId } = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  const client = createAdminClient();
  const existing = await client.from("shop_promotion_orders").select("request_hash").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.request_hash === hash ? "saved" : "conflict";
  const promotion = await getPromotion(slug);
  if (!promotion?.active || promotion.revision !== revision) return "changed";
  const { quote, offer } = await priceBasket(promotion, code, selection);
  if ((offer?.revision ?? null) !== offerRevision) return "changed";
  if (quote.total !== total || quote.status !== status) return "changed";
  if (status === "invalid") return "invalid";

  const eligible = new Set(offer?.variants.map(variant => variant.id));
  const attributed = status === "applied" && offer && quote.lines.some(line => eligible.has(line.id));
  const restricted = slug !== generalShopSlug || !!attributed;
  const member = restricted && memberId ? await getActiveClubMember(memberId) : null;
  if (restricted && !member) return "member";
  if (!restricted && (customer.length < 2 || contact.length < 5)) return "invalid";
  const { data, error } = await client.rpc("shop_submit_promotion_order", {
    p_slug: slug, p_revision: revision, p_id: id, p_customer: member?.display_name ?? customer, p_contact: restricted ? "" : contact,
    p_notes: notes, p_lines: quote.lines.map(({ id, product, variant, original, quantity, price }) => ({
      id, product, variant, original, quantity, price,
      ...(attributed && eligible.has(id) ? { offer: offer.slug } : {})
    })), p_total: total, p_discount: status === "applied" && (!offer || !!attributed), p_hash: hash,
    p_offer_slug: attributed ? offer.slug : null,
    p_offer_revision: attributed ? offer.revision : null,
    p_member_id: member?.id ?? null, p_family_id: member?.family_unit_members?.family_unit_id ?? null
  });
  if (error) throw error;
  return data as "saved" | "conflict" | "changed" | "limit" | "member";
}
