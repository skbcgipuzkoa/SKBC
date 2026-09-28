"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasInternalAccess } from "@/lib/auth";
import {
  assignPaymentMethod,
  closeCampaign,
  getCampaignById,
  listCampaignOrders,
  updateVariantPricing,
  upsertCatalogProduct
} from "@/lib/web-orders/repository";
import { advanceCampaignStatus } from "@/lib/web-orders/campaigns";
import { createWebOrdersClient } from "@/lib/web-orders/client";
import {
  sendPreparedMaterialOrderCommunications,
  type MaterialOrderPaymentMethod,
  type PreparedMaterialOrderCommunication
} from "@/lib/email-notifications";

const uuid = z.string().uuid();
const optionalUrl = z.union([z.literal(""), z.string().url()]);
const optionalDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

const productSchema = z.object({
  productId: uuid,
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1200),
  imageUrl: optionalUrl,
  sortOrder: z.coerce.number().int().min(0).max(10000),
  active: z.boolean()
});

const variantSchema = z.object({
  variantId: uuid,
  priceCents: z.coerce.number().int().min(0).max(1_000_000),
  costCents: z.coerce.number().int().min(0).max(1_000_000),
  marginCents: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  costBasis: z.string().trim().min(1).max(500),
  promotionPriceCents: z.union([z.literal(""), z.coerce.number().int().min(0).max(1_000_000)]),
  promotionStartsOn: optionalDate,
  promotionEndsOn: optionalDate,
  promotionActive: z.boolean(),
  active: z.boolean(),
}).superRefine((value, context) => {
  if (value.priceCents !== value.costCents + value.marginCents) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["priceCents"], message: "El precio final debe ser coste más margen." });
  }
  if (value.promotionActive && value.promotionPriceCents === "") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["promotionPriceCents"], message: "Una promoción activa requiere precio." });
  }
  if (value.promotionStartsOn && value.promotionEndsOn && value.promotionStartsOn > value.promotionEndsOn) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["promotionEndsOn"], message: "La promoción no puede terminar antes de empezar." });
  }
});

const paymentSchema = z.object({
  orderId: uuid,
  paymentMethod: z.enum(["cash", "bank", "paid"])
});

const closeSchema = z.object({
  campaignId: uuid,
  expectedOrderCount: z.coerce.number().int().min(0),
  expectedCommunicationCount: z.coerce.number().int().min(0),
  unresolvedCount: z.coerce.number().int().min(0)
});

const sendCommunicationsSchema = z.object({
  communicationIds: z.array(uuid).min(1).max(100),
  mode: z.enum(["test", "send", "force-resend"]),
  forceConfirmed: z.boolean()
}).superRefine((value, context) => {
  if (value.mode === "force-resend" && !value.forceConfirmed) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["forceConfirmed"], message: "El reenvío forzado requiere confirmación explícita." });
  }
});

export async function updateMaterialProductAction(formData: FormData) {
  await requireInternalAccess();
  const input = productSchema.parse({
    productId: formData.get("productId"),
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description"),
    imageUrl: formData.get("imageUrl"),
    sortOrder: formData.get("sortOrder"),
    active: formData.get("active") === "on"
  });

  await upsertCatalogProduct({
    id: input.productId,
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    image_url: input.imageUrl || null,
    sort_order: input.sortOrder,
    is_active: input.active
  });
  refresh("catalog-saved");
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
    paymentMethod: formData.get("paymentMethod")
  });
  await assignPaymentMethod(input.orderId, input.paymentMethod);
  refresh("payment-saved");
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
    !order.customer_email?.trim() || !order.customer_phone?.trim() || !order.payment_method
  ).length;
  if (unresolvedCount > 0 || input.unresolvedCount > 0) throw new Error("La campaña contiene datos sin resolver.");
  if (currentOrders.length !== input.expectedOrderCount) throw new Error("El número de pedidos cambió. Recarga la página antes de cerrar.");

  await closeCampaign(
    input.campaignId,
    input.expectedOrderCount,
    input.expectedCommunicationCount
  );
  refresh("campaign-closed");
}

export async function sendMaterialCampaignCommunicationsAction(formData: FormData) {
  await requireInternalAccess();
  const input = sendCommunicationsSchema.parse({
    communicationIds: JSON.parse(String(formData.get("communicationIds") ?? "[]")),
    mode: formData.get("mode"),
    forceConfirmed: formData.get("forceConfirmed") === "yes"
  });
  const client = createWebOrdersClient();
  const { data, error } = await client
    .from("skbc_order_communications")
    .select("id,status,recipient_name,recipient_email,snapshot")
    .in("id", input.communicationIds)
    .eq("channel", "email")
    .eq("direction", "outbound");
  if (error) throw error;
  if ((data ?? []).length !== input.communicationIds.length) throw new Error("La selección de comunicaciones cambió. Recarga la página.");

  const communications: PreparedMaterialOrderCommunication[] = [];
  for (const row of data ?? []) {
    if (row.status === "sent" && input.mode === "send") continue;
    try {
      communications.push(parsePreparedCommunication(row));
    } catch (parseError) {
      if (input.mode === "test") throw parseError;
      const { error: updateError } = await client.from("skbc_order_communications").update({
        status: "failed",
        sent_at: null,
        failed_at: new Date().toISOString(),
        failure_message: conciseActionError(parseError)
      }).eq("id", row.id);
      if (updateError) throw updateError;
    }
  }
  if (!communications.length && input.mode === "test") throw new Error("No hay comunicaciones válidas para la vista previa.");
  const result = await sendPreparedMaterialOrderCommunications({
    communications,
    testOnly: input.mode === "test",
    forceResend: input.mode === "force-resend",
    update: async (id, outcome) => {
      const { error: updateError } = await client.from("skbc_order_communications").update({
        status: outcome.status,
        sent_at: outcome.sentAt,
        failed_at: outcome.failedAt,
        failure_message: outcome.error
      }).eq("id", id);
      if (updateError) throw updateError;
    }
  });
  refresh(input.mode === "test" ? "communication-preview-sent" : `communications-sent-${result.sentCount}-failed-${result.failedCount}`);
}

async function requireInternalAccess() {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
}

function refresh(saved: string): never {
  revalidatePath("/pedidos-cinturones");
  redirect(`/pedidos-cinturones?saved=${saved}`);
}

function parsePreparedCommunication(row: Record<string, unknown>): PreparedMaterialOrderCommunication {
  const snapshot = requiredRecord(row.snapshot, "snapshot");
  const campaign = requiredRecord(snapshot.campaign, "campaign");
  const rawItems = z.array(z.record(z.string(), z.unknown())).min(1).parse(snapshot.items);
  const paymentMethod = z.enum(["cash", "bank", "paid"]).parse(snapshot.payment_method) as MaterialOrderPaymentMethod;
  const recipientEmail = z.string().trim().email().parse(row.recipient_email ?? snapshot.customer_email);
  return {
    id: uuid.parse(row.id),
    status: z.enum(["prepared", "sent", "failed"]).parse(row.status),
    recipientEmail,
    payerName: z.string().trim().min(1).parse(row.recipient_name ?? snapshot.customer_name),
    paymentMethod,
    campaignReference: `${formatCampaignDate(campaign.period_start)} - ${formatCampaignDate(campaign.period_end)}`,
    orderNumber: z.string().trim().min(1).parse(snapshot.order_number),
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

function conciseActionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Error desconocido.");
  return message.replace(/\s+/g, " ").trim().slice(0, 240);
}
