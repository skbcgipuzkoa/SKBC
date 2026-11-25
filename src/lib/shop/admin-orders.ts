import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalShopSlug, type QuotedLine } from "./promotion";
import type { PlannedPaymentMethod, PromotionPaymentStatus, PromotionDeliveryStatus } from "./order-management";

export type PromotionAdminOrder = { id: string; customer: string; contact: string; notes: string; created_at: string; lines: (QuotedLine & { offer?: string; recipient?: string })[]; promotion_slug: string; offer_slug: string | null; total_cents: number; discount_applied: boolean; payment_status: PromotionPaymentStatus; delivery_status: PromotionDeliveryStatus; paid_at: string | null; delivered_at: string | null; management_revision: string; planned_payment_method: PlannedPaymentMethod | null };

export async function loadPromotionOrders(slug?: string) {
  const client = createAdminClient();
  const orders: PromotionAdminOrder[] = [];
  const pageSize = 200;
  const visibility = !slug ? "" : slug === generalShopSlug ? "promotion_slug.eq." + slug : "promotion_slug.eq." + slug + ",offer_slug.eq." + slug;
  for (let start = 0; ; start += pageSize) {
    const query = client.from("shop_promotion_orders")
      .select("id,customer,contact,notes,created_at,lines,total_cents,discount_applied,promotion_slug,offer_slug,payment_status,delivery_status,paid_at,delivered_at,management_revision,planned_payment_method");
    const { data, error } = await (visibility ? query.or(visibility) : query)
      .order("created_at", { ascending: false }).order("id")
      .range(start, start + pageSize - 1).returns<PromotionAdminOrder[]>();
    if (error) throw error;
    orders.push(...data);
    if (data.length < pageSize) return orders;
  }
}
