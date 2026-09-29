"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasInternalAccess } from "@/lib/auth";
import {
  assignPaymentMethod,
  claimCommunication,
  closeCampaign,
  completeCommunicationAttempt,
  countEligibleCommunicationGroups,
  createCatalogVariant,
  deleteCompletedCampaign,
  getCampaignById,
  listCampaignOrders,
  reconcileCommunication,
  updateFamilyPayment,
  updateFamilyDelivery,
  updateVariantPricing,
  upsertCatalogProduct
} from "@/lib/web-orders/repository";
import { advanceCampaignStatus } from "@/lib/web-orders/campaigns";
import { createWebOrdersClient } from "@/lib/web-orders/client";
import {
  dispatchPreparedMaterialOrderCommunications,
  sendPreparedMaterialOrderCommunications,
  type MaterialOrderPaymentMethod,
  type PreparedMaterialOrderCommunication
} from "@/lib/email-notifications";

const uuid = z.string().uuid();
const optionalUrl = z.union([z.literal(""), z.string().url()]);
const optionalImagePath = z.union([
  z.literal(""),
  z.string().url(),
  z.string().regex(/^\/?assets\/[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/)
]);
const optionalDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

const productSchema = z.object({
  productId: z.union([uuid, z.literal("")]),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(160),
  supplierReference: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(120),
  category: z.string().trim().min(1).max(120),
  recommendedLevel: z.string().trim().max(240),
  weight: z.string().trim().max(80),
  description: z.string().trim().max(1200),
  imageUrl: optionalImagePath,
  sourceUrl: optionalUrl,
  imageAttribution: z.string().trim().max(500),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  active: z.boolean()
}).superRefine((value, context) => {
  if ((value.imageUrl || value.sourceUrl) && !value.imageAttribution) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["imageAttribution"], message: "Las imágenes y fuentes requieren atribución." });
  }
});

const variantFieldsSchema = z.object({
  priceCents: z.coerce.number().int().min(0).max(1_000_000),
  costCents: z.coerce.number().int().min(0).max(1_000_000),
  marginCents: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  costBasis: z.string().trim().min(1).max(500),
  promotionPriceCents: z.union([z.literal(""), z.coerce.number().int().min(0).max(1_000_000)]),
  promotionStartsOn: optionalDate,
  promotionEndsOn: optionalDate,
  promotionActive: z.boolean(),
  active: z.boolean(),
});

function validateVariantPricing(value: z.infer<typeof variantFieldsSchema>, context: z.RefinementCtx) {
  if (value.priceCents !== value.costCents + value.marginCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["priceCents"], message: "El precio final debe ser coste más margen." });
  }
  if (value.promotionActive && value.promotionPriceCents === "") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["promotionPriceCents"], message: "Una promoción activa requiere precio." });
  }
  if (value.promotionStartsOn && value.promotionEndsOn && value.promotionStartsOn > value.promotionEndsOn) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["promotionEndsOn"], message: "La promoción no puede terminar antes de empezar." });
  }
}

const variantSchema = variantFieldsSchema.extend({ variantId: uuid }).superRefine(validateVariantPricing);

const createVariantSchema = variantFieldsSchema.extend({
  productId: uuid,
  sku: z.string().trim().min(1).max(160),
  size: z.string().trim().min(1).max(120),
  supplierReference: z.string().trim().min(1).max(160),
  sortOrder: z.coerce.number().int().min(0).max(10000)
}).superRefine(validateVariantPricing);

const paymentSchema = z.object({
  orderId: uuid,
  campaignId: uuid,
  paymentMethod: z.enum(["cash", "bank", "paid"])
});

const familyPaymentSchema = z.object({
  paymentId: uuid,
  campaignId: uuid,
  status: z.enum(["pending", "cash_paid", "bank_submitted"]),
  notes: z.string().trim().max(1000)
});

const familyDeliverySchema = z.object({
  paymentId: uuid,
  campaignId: uuid,
  deliveryStatus: z.enum(["pending", "partial", "delivered"]),
  deliveryNote: z.string().trim().max(1000)
}).superRefine((value, context) => {
  if (value.deliveryStatus === "partial" && !value.deliveryNote) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryNote"], message: "La entrega parcial requiere indicar qué falta." });
  }
});

const closeSchema = z.object({
  campaignId: uuid,
  expectedOrderCount: z.coerce.number().int().min(0),
  expectedCommunicationCount: z.coerce.number().int().min(0),
  unresolvedCount: z.coerce.number().int().min(0)
});

const sendCommunicationsSchema = z.object({
  campaignId: uuid,
  communicationIds: z.array(uuid).min(1).max(100),
  mode: z.enum(["test", "send", "force-resend"]),
  sendConfirmed: z.boolean(),
  forceConfirmed: z.boolean()
}).superRefine((value, context) => {
  if (value.mode !== "test" && !value.sendConfirmed) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sendConfirmed"], message: "El envío final requiere confirmación explícita." });
  }
  if (value.mode === "force-resend" && !value.forceConfirmed) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["forceConfirmed"], message: "El reenvío forzado requiere confirmación explícita." });
  }
});

const reconcileSchema = z.object({
  campaignId: uuid,
  communicationId: uuid,
  attemptToken: uuid,
  delivered: z.enum(["yes", "no"]),
  reconcileConfirmed: z.boolean()
}).refine((value) => value.reconcileConfirmed, { path: ["reconcileConfirmed"], message: "La reconciliación requiere confirmación explícita." });

export async function updateMaterialProductAction(formData: FormData) {
  await requireInternalAccess();
  const input = productSchema.parse({
    productId: formData.get("productId") ?? "",
    slug: formData.get("slug"),
    name: formData.get("name"),
    supplierReference: formData.get("supplierReference"),
    brand: formData.get("brand"),
    category: formData.get("category"),
    recommendedLevel: formData.get("recommendedLevel"),
    weight: formData.get("weight"),
    description: formData.get("description"),
    imageUrl: formData.get("imageUrl"),
    sourceUrl: formData.get("sourceUrl"),
    imageAttribution: formData.get("imageAttribution"),
    sortOrder: formData.get("sortOrder"),
    active: formData.get("active") === "on"
  });

  const editableFields = {
    slug: input.slug,
    name: input.name,
    brand: input.brand || null,
    supplier_reference: input.supplierReference,
    category: input.category,
    recommended_level: input.recommendedLevel || null,
    weight: input.weight || null,
    description: input.description || null,
    image_url: input.imageUrl || null,
    source_url: input.sourceUrl || null,
    image_attribution: input.imageAttribution || null,
    sort_order: input.sortOrder,
    is_active: input.active
  };
  await upsertCatalogProduct(input.productId
    ? { id: input.productId, ...editableFields }
    : { ...editableFields, catalog_owner: "management", metadata: {} });
  refresh("catalog-saved");
}

export async function createMaterialVariantAction(formData: FormData) {
  await requireInternalAccess();
  const input = createVariantSchema.parse({
    productId: formData.get("productId"),
    sku: formData.get("sku"),
    size: formData.get("size"),
    supplierReference: formData.get("supplierReference"),
    priceCents: formData.get("priceCents"),
    costCents: formData.get("costCents"),
    marginCents: formData.get("marginCents"),
    costBasis: formData.get("costBasis"),
    promotionPriceCents: formData.get("promotionPriceCents"),
    promotionStartsOn: formData.get("promotionStartsOn"),
    promotionEndsOn: formData.get("promotionEndsOn"),
    promotionActive: formData.get("promotionActive") === "on",
    sortOrder: formData.get("sortOrder"),
    active: formData.get("active") === "on"
  });

  await createCatalogVariant({
    product_id: input.productId,
    sku: input.sku,
    name: input.size,
    attributes: { size: input.size },
    supplier_reference: input.supplierReference,
    cost_cents: input.costCents,
    margin_cents: input.marginCents,
    price_cents: input.priceCents,
    unit_price_cents: input.priceCents,
    cost_basis: input.costBasis,
    promotion_price_cents: input.promotionPriceCents === "" ? null : input.promotionPriceCents,
    promotion_starts_at: input.promotionStartsOn || null,
    promotion_ends_at: input.promotionEndsOn || null,
    promotion_is_active: input.promotionActive,
    catalog_owner: "management",
    metadata: {},
    sort_order: input.sortOrder,
    is_active: input.active
  });
  refresh("catalog-variant-created");
}

export async function updateMaterialVariantAction(formData: FormData) {
  await requireInternalAccess();
  const input = variantSchema.parse({
    variantId: formData.get("variantId"),
    priceCents: formData.get("priceCents"),
    costCents: formData.get("costCents"),
    marginCents: formData.get("marginCents"),
    costBasis: formData.get("costBasis"),
    promotionPriceCents: formData.get("promotionPriceCents"),
    promotionStartsOn: formData.get("promotionStartsOn"),
    promotionEndsOn: formData.get("promotionEndsOn"),
    promotionActive: formData.get("promotionActive") === "on",
    active: formData.get("active") === "on",
  });

  const pricingUpdate = {
    cost_cents: input.costCents,
    margin_cents: input.marginCents,
    price_cents: input.priceCents,
    cost_basis: input.costBasis,
    promotion_price_cents: input.promotionPriceCents === "" ? null : input.promotionPriceCents,
    promotion_starts_at: input.promotionStartsOn || null,
    promotion_ends_at: input.promotionEndsOn || null,
    promotion_is_active: input.promotionActive,
    is_active: input.active,
  };

  await updateVariantPricing(input.variantId, pricingUpdate);
  refresh("catalog-saved");
}

export async function assignMaterialPaymentAction(formData: FormData) {
  await requireInternalAccess();
  const input = paymentSchema.parse({
    orderId: formData.get("orderId"),
    campaignId: formData.get("campaignId"),
    paymentMethod: formData.get("paymentMethod")
  });
  await assignPaymentMethod(input.orderId, input.paymentMethod);
  refresh("payment-saved", input.campaignId);
}

export async function updateMaterialFamilyPaymentAction(formData: FormData) {
  await requireInternalAccess();
  const input = familyPaymentSchema.parse({
    paymentId: formData.get("paymentId"),
    campaignId: formData.get("campaignId"),
    status: formData.get("status"),
    notes: formData.get("notes")
  });
  await updateFamilyPayment({ ...input, notes: input.notes || null });
  refresh("family-payment-saved", input.campaignId, "payments");
}

export async function updateMaterialFamilyDeliveryAction(formData: FormData) {
  await requireInternalAccess();
  const input = familyDeliverySchema.parse({
    paymentId: formData.get("paymentId"),
    campaignId: formData.get("campaignId"),
    deliveryStatus: formData.get("deliveryStatus"),
    deliveryNote: formData.get("deliveryNote")
  });
  await updateFamilyDelivery({
    paymentId: input.paymentId,
    campaignId: input.campaignId,
    status: input.deliveryStatus,
    note: input.deliveryNote || null
  });
  refresh("family-delivery-saved", input.campaignId, "payments");
}

export async function deleteCompletedMaterialCampaignAction(formData: FormData) {
  await requireInternalAccess();
  const campaignId = uuid.parse(formData.get("campaignId"));
  await deleteCompletedCampaign(campaignId);
  revalidatePath("/pedidos-cinturones");
  redirect("/pedidos-cinturones?saved=completed-order-deleted&tab=payments");
}

export async function closeMaterialCampaignAction(formData: FormData) {
  await requireInternalAccess();
  const input = closeSchema.parse({
    campaignId: formData.get("campaignId"),
    expectedOrderCount: formData.get("expectedOrderCount"),
    expectedCommunicationCount: formData.get("expectedCommunicationCount"),
    unresolvedCount: formData.get("unresolvedCount")
  });
  const campaign = await getCampaignById(input.campaignId);
  if (!campaign) throw new Error("La campaña ya no existe.");
  if (advanceCampaignStatus(campaign).status !== "pending_close") {
    throw new Error("La campaña solo se puede cerrar cuando el periodo ha terminado.");
  }
  const currentOrders = await listCampaignOrders(input.campaignId);
  const unresolvedCount = currentOrders.filter((order) =>
    order.status !== "cancelled" && (!order.customer_email?.trim() || !order.customer_phone?.trim() || !order.payment_method)
  ).length;
  if (unresolvedCount > 0 || input.unresolvedCount > 0) throw new Error("La campaña contiene datos sin resolver.");
  if (currentOrders.length !== input.expectedOrderCount) throw new Error("El número de pedidos cambió. Recarga la página antes de cerrar.");
  if (countEligibleCommunicationGroups(currentOrders) !== input.expectedCommunicationCount) {
    throw new Error("El número de familias con email cambió. Recarga la página antes de cerrar.");
  }

  await closeCampaign(
    input.campaignId,
    input.expectedOrderCount,
    input.expectedCommunicationCount
  );
  refresh("campaign-closed", input.campaignId);
}

export async function sendMaterialCampaignCommunicationsAction(formData: FormData) {
  await requireInternalAccess();
  const input = sendCommunicationsSchema.parse({
    campaignId: formData.get("campaignId"),
    communicationIds: JSON.parse(String(formData.get("communicationIds") ?? "[]")),
    mode: formData.get("mode"),
    sendConfirmed: formData.get("sendConfirmed") === "yes",
    forceConfirmed: formData.get("forceConfirmed") === "yes"
  });
  if (new Set(input.communicationIds).size !== input.communicationIds.length) throw new Error("La selección contiene comunicaciones duplicadas.");
  const campaign = await getCampaignById(input.campaignId);
  if (!campaign || campaign.status !== "closed") throw new Error("La campaña debe estar cerrada y revisada antes del envío.");
  const client = createWebOrdersClient();
  const { data, error } = await client
    .from("skbc_order_communications")
    .select("id,status,recipient_name,recipient_email,snapshot")
    .in("id", input.communicationIds)
    .eq("channel", "email")
    .eq("direction", "outbound");
  if (error) throw error;
  if ((data ?? []).length !== input.communicationIds.length) throw new Error("La selección de comunicaciones cambió. Recarga la página.");

  const previews: PreparedMaterialOrderCommunication[] = [];
  for (const row of data ?? []) {
    const preview = parsePreparedCommunication(row);
    if (preview.campaignId !== input.campaignId) throw new Error("Todas las comunicaciones deben pertenecer exactamente a la campaña seleccionada.");
    previews.push(preview);
  }
  const totals = await dispatchPreparedMaterialOrderCommunications(previews, input.mode, {
    sendPreview: async (communications) => sendPreparedMaterialOrderCommunications({
      communications,
      testOnly: true,
      complete: async () => undefined,
      markDeliveredUnconfirmed: async () => undefined
    }),
    claim: async (communication, forceResend) => parsePreparedCommunication(await claimCommunication({
      campaignId: input.campaignId,
      communicationId: communication.id,
      attemptToken: randomUUID(),
      forceResend
    })),
    sendCustomer: async (communication) => sendPreparedMaterialOrderCommunications({
      communications: [communication],
      complete: async (completedCommunication, outcome) => {
        await completeCommunicationAttempt({
          campaignId: completedCommunication.campaignId,
          communicationId: completedCommunication.id,
          attemptToken: completedCommunication.attemptToken!,
          outcome: outcome.outcome,
          errorMessage: outcome.error
        });
      },
      markDeliveredUnconfirmed: async (completedCommunication, errorMessage) => {
        await completeCommunicationAttempt({
          campaignId: completedCommunication.campaignId,
          communicationId: completedCommunication.id,
          attemptToken: completedCommunication.attemptToken!,
          outcome: "delivered_unconfirmed",
          errorMessage
        });
      }
    })
  });
  if (totals.previewOnly) {
    refresh("communication-preview-sent");
    return;
  }
  refresh(`communications-sent-${totals.sentCount}-failed-${totals.failedCount}-ambiguous-${totals.ambiguousCount}`, input.campaignId);
}

export async function reconcileMaterialCommunicationAction(formData: FormData) {
  await requireInternalAccess();
  const input = reconcileSchema.parse({
    campaignId: formData.get("campaignId"),
    communicationId: formData.get("communicationId"),
    attemptToken: formData.get("attemptToken"),
    delivered: formData.get("delivered"),
    reconcileConfirmed: formData.get("reconcileConfirmed") === "yes"
  });
  await reconcileCommunication({
    campaignId: input.campaignId,
    communicationId: input.communicationId,
    attemptToken: input.attemptToken,
    delivered: input.delivered === "yes"
  });
  refresh("communication-reconciled", input.campaignId);
}

async function requireInternalAccess() {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
}

function refresh(saved: string, campaignId?: string, tab?: string): never {
  revalidatePath("/pedidos-cinturones");
  const campaign = campaignId ? `&campaign=${encodeURIComponent(campaignId)}` : "";
  const selectedTab = tab ? `&tab=${encodeURIComponent(tab)}` : "";
  redirect(`/pedidos-cinturones?saved=${saved}${campaign}${selectedTab}`);
}

function parsePreparedCommunication(row: Record<string, unknown>): PreparedMaterialOrderCommunication {
  const snapshot = requiredRecord(row.snapshot, "snapshot");
  const campaign = requiredRecord(snapshot.campaign, "campaign");
  const rawItems = z.array(z.record(z.string(), z.unknown())).min(1).parse(snapshot.items);
  const paymentMethods = z.array(z.enum(["cash", "bank", "paid"])).min(1).parse(
    snapshot.payment_methods ?? [snapshot.payment_method]
  );
  const paymentMethod = (new Set(paymentMethods).size === 1 ? paymentMethods[0] : "mixed") as MaterialOrderPaymentMethod;
  const recipientEmail = z.string().trim().email().parse(row.recipient_email ?? snapshot.customer_email);
  const orderNumbers = z.array(z.string().trim().min(1)).min(1).parse(
    snapshot.order_numbers ?? [snapshot.order_number]
  );
  return {
    id: uuid.parse(row.communication_id ?? row.id),
    status: z.enum(["prepared", "sending", "sent", "failed", "delivered_unconfirmed"]).parse(row.communication_status ?? row.status),
    campaignId: uuid.parse(campaign.id),
    attemptToken: row.attempt_token ? uuid.parse(row.attempt_token) : null,
    recipientEmail,
    payerName: z.string().trim().min(1).parse(row.recipient_name ?? snapshot.customer_name),
    paymentMethod,
    campaignReference: `${formatCampaignDate(campaign.period_start)} - ${formatCampaignDate(campaign.period_end)}`,
    orderNumber: orderNumbers.join(", "),
    items: rawItems.map((item, index) => ({
      id: z.string().default(`line-${index + 1}`).parse(item.id),
      recipient: z.string().trim().min(1).catch("Pedido familiar").parse(item.recipient ?? item.recipient_name),
      productName: z.string().trim().min(1).parse(item.product_name),
      variantName: z.string().trim().min(1).parse(item.variant_name ?? item.size),
      sku: z.string().trim().min(1).parse(item.sku),
      quantity: z.coerce.number().int().min(1).parse(item.quantity),
      unitPriceCents: z.coerce.number().int().min(0).parse(item.unit_price_cents),
      lineTotalCents: z.coerce.number().int().min(0).parse(item.line_total_cents)
    }))
  };
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`La comunicación no contiene ${label} válido.`);
  return value as Record<string, unknown>;
}

function formatCampaignDate(value: unknown) {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(value);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(`${date}T12:00:00Z`));
}
