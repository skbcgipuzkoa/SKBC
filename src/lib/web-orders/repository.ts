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
  },
  claimCommunication: {
    name: "claim_skbc_order_communication",
    args: ["p_campaign_id", "p_communication_id", "p_attempt_token", "p_force_resend", "p_confirmed"]
  },
  completeCommunication: {
    name: "complete_skbc_order_communication_attempt",
    args: ["p_campaign_id", "p_communication_id", "p_attempt_token", "p_outcome", "p_error_message"]
  },
  reconcileCommunication: {
    name: "reconcile_skbc_order_communication",
    args: ["p_campaign_id", "p_communication_id", "p_attempt_token", "p_delivered", "p_confirmed"]
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

type CatalogProductFields = Omit<WebOrderProduct, "id" | "created_at" | "updated_at">;
export type CatalogProductInput =
  | ({ id: string } & Partial<CatalogProductFields>)
  | ({ id?: never } & CatalogProductFields & { supplier_reference: string });

export type ClaimedCommunication = {
  communication_id: string;
  communication_status: "sending";
  recipient_name: string | null;
  recipient_email: string | null;
  snapshot: unknown;
  attempt_token: string;
  attempt_started_at: string;
};

export type VariantPricingInput = Pick<
  WebOrderVariant,
  | "cost_cents"
  | "margin_cents"
  | "price_cents"
  | "cost_basis"
  | "promotion_price_cents"
  | "promotion_starts_at"
  | "promotion_ends_at"
  | "promotion_is_active"
  | "is_active"
>;

type CatalogVariantFields = Omit<WebOrderVariant, "id" | "created_at" | "updated_at">;
export type CatalogVariantInput = CatalogVariantFields;

export type CloseCampaignResult = {
  campaign_id: string;
  order_count: number;
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

export function countEligibleCommunicationGroups(
  orders: Array<Pick<WebOrder, "status" | "customer_email">>
) {
  return new Set(
    orders
      .filter((order) => order.status !== "cancelled")
      .map((order) => order.customer_email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  ).size;
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
  const client = createWebOrdersClient();
  let result;
  if (input.id) {
    const { id, ...changes } = input;
    result = await client.from("skbc_merch_products").update(changes).eq("id", id).select("*").single();
  } else {
    result = await client.from("skbc_merch_products").insert(input as CatalogProductFields).select("*").single();
  }
  const { data, error } = result;

  if (error) throw error;
  return data as WebOrderProduct;
}

export async function claimCommunication(input: {
  campaignId: string;
  communicationId: string;
  attemptToken: string;
  forceResend: boolean;
}) {
  const { data, error } = await createWebOrdersClient().rpc(
    WEB_ORDER_RPC_CONTRACTS.claimCommunication.name,
    {
      p_campaign_id: input.campaignId,
      p_communication_id: input.communicationId,
      p_attempt_token: input.attemptToken,
      p_force_resend: input.forceResend,
      p_confirmed: true
    }
  );
  if (error) throw error;
  return requireRpcResult<ClaimedCommunication>(data, WEB_ORDER_RPC_CONTRACTS.claimCommunication.name);
}

export async function completeCommunicationAttempt(input: {
  campaignId: string;
  communicationId: string;
  attemptToken: string;
  outcome: "delivered" | "smtp_failed" | "delivered_unconfirmed";
  errorMessage: string | null;
}) {
  const { data, error } = await createWebOrdersClient().rpc(
    WEB_ORDER_RPC_CONTRACTS.completeCommunication.name,
    {
      p_campaign_id: input.campaignId,
      p_communication_id: input.communicationId,
      p_attempt_token: input.attemptToken,
      p_outcome: input.outcome,
      p_error_message: input.errorMessage
    }
  );
  if (error) throw error;
  return requireRpcResult<{ communication_id: string; communication_status: string }>(data, WEB_ORDER_RPC_CONTRACTS.completeCommunication.name);
}

export async function reconcileCommunication(input: {
  campaignId: string;
  communicationId: string;
  attemptToken: string;
  delivered: boolean;
}) {
  const { data, error } = await createWebOrdersClient().rpc(
    WEB_ORDER_RPC_CONTRACTS.reconcileCommunication.name,
    {
      p_campaign_id: input.campaignId,
      p_communication_id: input.communicationId,
      p_attempt_token: input.attemptToken,
      p_delivered: input.delivered,
      p_confirmed: true
    }
  );
  if (error) throw error;
  return requireRpcResult<{ communication_id: string; communication_status: string }>(data, WEB_ORDER_RPC_CONTRACTS.reconcileCommunication.name);
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

export async function createCatalogVariant(input: CatalogVariantInput) {
  const { data, error } = await createWebOrdersClient()
    .from("skbc_merch_variants").insert(input as CatalogVariantFields)
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
  return parseCloseCampaignResult(data);
}

export function parseCloseCampaignResult(data: unknown): CloseCampaignResult {
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== "object") throw new Error("close_skbc_order_campaign returned an invalid result.");
  const row = result as Record<string, unknown>;
  if (
    typeof row.campaign_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.campaign_id) ||
    !Number.isInteger(row.order_count) || Number(row.order_count) < 0 ||
    !Number.isInteger(row.prepared_communication_count) || Number(row.prepared_communication_count) < 0
  ) throw new Error("close_skbc_order_campaign returned an invalid result.");
  return row as CloseCampaignResult;
}

function requireRpcResult<T>(data: unknown, rpcName: string): T {
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error(`${rpcName} returned no result.`);
  return result as T;
}
