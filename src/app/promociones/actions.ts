"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPromotion } from "@/lib/shop/repository";
import { quotePromotion } from "@/lib/shop/promotion";

const basketSchema = z.object({
  slug: z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  code: z.string().max(50),
  selection: z.array(z.object({ id: z.string().uuid(), quantity: z.number().int().positive().max(2147483647) })).max(200)
});

export async function promotionQuote(input: unknown) {
  const basket = basketSchema.parse(input);
  const promotion = await getPromotion(basket.slug);
  if (!promotion?.active) throw new Error("Promoción no disponible.");
  const quote = quotePromotion(promotion, basket.code, basket.selection);
  return {
    revision: promotion.revision,
    status: quote.status,
    total: quote.total,
    lines: quote.lines.map(({ id, price, quantity }) => ({ id, price, quantity }))
  };
}

const checkoutSchema = basketSchema.extend({
  id: z.string().uuid(),
  revision: z.string().uuid(),
  total: z.number().int().nonnegative().safe(),
  status: z.enum(["none", "invalid", "expired", "applied"]),
  customer: z.string().trim().min(2).max(160),
  contact: z.string().trim().min(5).max(160),
  notes: z.string().trim().max(1000)
});

export async function submitPromotion(input: unknown) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success || !parsed.data.selection.length) return "invalid";
  const { id, slug, revision, total, status, code, selection, customer, contact, notes } = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  const client = createAdminClient();
  const existing = await client.from("shop_promotion_orders").select("request_hash").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.request_hash === hash ? "saved" : "conflict";
  const promotion = await getPromotion(slug);
  if (!promotion?.active || promotion.revision !== revision) return "changed";
  const quote = quotePromotion(promotion, code, selection);
  if (quote.total !== total || quote.status !== status) return "changed";
  if (status === "invalid") return "invalid";

  const { data, error } = await client.rpc("shop_submit_promotion_order", {
    p_slug: slug, p_revision: revision, p_id: id, p_customer: customer, p_contact: contact,
    p_notes: notes, p_lines: quote.lines.map(({ id, product, variant, original, quantity, price }) => ({
      id, product, variant, original, quantity, price
    })), p_total: total, p_discount: status === "applied", p_hash: hash
  });
  if (error) throw error;
  return data as "saved" | "conflict" | "changed";
}
