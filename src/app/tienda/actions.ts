"use server";

import { z } from "zod";
import { materialRequest } from "./material";

const schema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(25).refine(value => value.replace(/\D/g, "").length >= 6),
  member: z.string().trim().max(120),
  notes: z.string().trim().max(1000),
  consent: z.literal(true),
  items: z.array(z.object({ variant_id: z.string().uuid(), recipient: z.string().trim().min(1).max(120), quantity: z.number().int().min(1).max(10) })).min(1).max(30)
});

export async function submitMaterialOrder(input: unknown): Promise<{ reference: string; total: number } | { error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Revisa tus datos y los artículos del pedido." };
  const { id, name, email, phone, member, notes, items } = parsed.data;
  try {
    const response = await materialRequest("rpc/submit_skbc_merch_order", {
      p_idempotency_key: id, p_customer_name: name, p_customer_email: email,
      p_customer_phone: phone, p_member_reference: member, p_comments: notes, p_page_lang: "es", p_items: items
    });
    if (!response.ok) throw new Error("Pedido no confirmado");
    const [order] = await response.json();
    if (typeof order?.order_number !== "string" || !Number.isSafeInteger(order?.total_cents)) throw new Error("Sin referencia");
    return { reference: order.order_number, total: order.total_cents };
  } catch {
    return { error: "No se ha podido confirmar el pedido. Revisa la disponibilidad e inténtalo de nuevo." };
  }
}
