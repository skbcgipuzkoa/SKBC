import "server-only";

import { createWebOrdersClient } from "./client";
import { getCampaignPeriod } from "./campaigns";
import type {
  WebOrder,
  WebOrderCampaign,
  WebOrderItem,
  WebOrderPaymentMethod,
  WebOrderProduct,
  WebOrderVariant
} from "./types";

export type CampaignOrder = WebOrder & { items: WebOrderItem[] };
export type CatalogProduct = WebOrderProduct & { variants: WebOrderVariant[] };

export type SupplierSummaryRow = {
  sku: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
};

export type CatalogProductInput = Omit<WebOrderProduct, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

export type VariantPricingInput = Pick<
  WebOrderVariant,
  "unit_price_cents" | "is_active"
>;

export type CloseCampaignResult = {
  campaign: WebOrderCampaign;
  prepared_communication_count: number;
};

export async function getCurrentCampaign(at: Date = new Date()) {
  const period = getCampaignPeriod(at);
  const { data, error } = await createWebOrdersClient()
    .from("skbc_order_campaigns")
    .select("*")
    .eq("period_start", period.startsOn)
    .eq("period_end", period.endsOn)
    .maybeSingle();

  if (error) throw error;
  return data as WebOrderCampaign | null;
}

export async function listCampaignOrders(campaignId: string) {
  const { data, error } = await createWebOrdersClient()
    .from("skbc_merch_orders")
    .select("*, items:skbc_merch_order_items(*)")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CampaignOrder[];
}

export async function getSupplierSummary(campaignId: string) {
  const orders = await listCampaignOrders(campaignId);
  const grouped = new Map<string, SupplierSummaryRow>();

  for (const item of orders.flatMap((order) => order.items)) {
    const key = [item.sku, item.product_name, item.variant_name, item.unit_price_cents].join("\u0000");
    const current = grouped.get(key);
    if (current) {
      current.quantity += item.quantity;
      current.totalPriceCents += item.line_total_cents;
    } else {
      grouped.set(key, {
        sku: item.sku,
        productName: item.product_name,
        variantName: item.variant_name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        totalPriceCents: item.line_total_cents
      });
    }
  }

  return [...grouped.values()].sort((left, right) =>
    `${left.sku}\u0000${left.variantName}`.localeCompare(`${right.sku}\u0000${right.variantName}`)
  );
}

export async function listCatalog() {
  const { data, error } = await createWebOrdersClient()
    .from("skbc_merch_products")
    .select("*, variants:skbc_merch_variants(*)")
    .order("sort_order", { ascending: true })
    .order("sort_order", { referencedTable: "skbc_merch_variants", ascending: true });

  if (error) throw error;
  return (data ?? []) as CatalogProduct[];
}

export async function upsertCatalogProduct(input: CatalogProductInput) {
  const { data, error } = await createWebOrdersClient()
    .from("skbc_merch_products")
    .upsert(input, { onConflict: input.id ? "id" : "slug" })
    .select("*")
    .single();

  if (error) throw error;
  return data as WebOrderProduct;
}

export async function updateVariantPricing(variantId: string, input: VariantPricingInput) {
  const { data, error } = await createWebOrdersClient()
    .from("skbc_merch_variants")
    .update(input)
    .eq("id", variantId)
    .select("*")
    .single();

  if (error) throw error;
  return data as WebOrderVariant;
}

export async function assignPaymentMethod(orderId: string, paymentMethod: WebOrderPaymentMethod) {
  const { data, error } = await createWebOrdersClient()
    .from("skbc_merch_orders")
    .update({ payment_method: paymentMethod })
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) throw error;
  return data as WebOrder;
}

export async function closeCampaign(campaignId: string) {
  // SQL contract: lock and close the campaign, freeze its orders, prepare one
  // communication per payer, then return the campaign and prepared row count.
  const { data, error } = await createWebOrdersClient().rpc("close_skbc_order_campaign", {
    p_campaign_id: campaignId
  });

  if (error) throw error;
  if (!data) throw new Error("Campaign close RPC returned no result.");
  return data as CloseCampaignResult;
}
