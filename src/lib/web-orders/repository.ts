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

export const WEB_ORDER_RPC_CONTRACTS = {
  assignPaymentMethod: {
    name: "assign_skbc_order_payment_method",
    args: ["p_order_id", "p_payment_method"],
    requiresOpenCampaign: true
  },
  closeCampaign: {
    name: "close_skbc_order_campaign",
    args: ["p_campaign_id", "p_expected_order_count", "p_expected_communication_count"],
    locksCampaign: true,
    preparesCommunications: true
  }
} as const;

export const SUPPLIER_SUMMARY_SCHEMA_FIELDS = [
  "supplier_reference",
  "size",
  "cost_cents"
] as const;

export type SupplierOrderItem = Pick<WebOrderItem, "product_name" | "quantity"> & {
  supplier_reference: string;
  size: string;
  cost_cents: number;
};

export type SupplierSummaryRow = {
  supplierReference: string;
  productName: string;
  size: string;
  quantity: number;
  unitCostCents: number;
  totalCostCents: number;
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

export async function getCampaignById(campaignId: string) {
  const { data, error } = await createWebOrdersClient()
    .from("skbc_order_campaigns")
    .select("*")
    .eq("id", campaignId)
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
  return summarizeSupplierItems(
    orders.flatMap((order) => order.items) as unknown as SupplierOrderItem[]
  );
}

export function summarizeSupplierItems(items: SupplierOrderItem[]) {
  const grouped = new Map<string, SupplierSummaryRow>();

  for (const item of items) {
    const key = [item.supplier_reference, item.size].join("\u0000");
    const current = grouped.get(key);
    if (current) {
      current.quantity += item.quantity;
      current.totalCostCents += item.cost_cents * item.quantity;
    } else {
      grouped.set(key, {
        supplierReference: item.supplier_reference,
        productName: item.product_name,
        size: item.size,
        quantity: item.quantity,
        unitCostCents: item.cost_cents,
        totalCostCents: item.cost_cents * item.quantity
      });
    }
  }

  return [...grouped.values()].sort((left, right) =>
    `${left.supplierReference}\u0000${left.size}`.localeCompare(
      `${right.supplierReference}\u0000${right.size}`
    )
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
  // SQL contract: lock the order and its campaign, reject unless the campaign
  // is open, update payment_method, and return the updated order atomically.
  const { data, error } = await createWebOrdersClient().rpc(
    WEB_ORDER_RPC_CONTRACTS.assignPaymentMethod.name,
    { p_order_id: orderId, p_payment_method: paymentMethod }
  );

  if (error) throw error;
  return requireRpcResult<WebOrder>(data, WEB_ORDER_RPC_CONTRACTS.assignPaymentMethod.name);
}

export async function closeCampaign(
  campaignId: string,
  expectedOrderCount: number,
  expectedCommunicationCount: number
) {
  // SQL contract: lock and close the campaign, freeze its orders, prepare one
  // communication per payer, then return the campaign and prepared row count.
  const { data, error } = await createWebOrdersClient().rpc(
    WEB_ORDER_RPC_CONTRACTS.closeCampaign.name,
    {
      p_campaign_id: campaignId,
      p_expected_order_count: expectedOrderCount,
      p_expected_communication_count: expectedCommunicationCount
    }
  );

  if (error) throw error;
  return requireRpcResult<CloseCampaignResult>(data, WEB_ORDER_RPC_CONTRACTS.closeCampaign.name);
}

function requireRpcResult<T>(data: unknown, rpcName: string): T {
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error(`${rpcName} returned no result.`);
  return result as T;
}
