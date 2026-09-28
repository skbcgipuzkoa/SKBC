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
import type { WebOrderJson } from "@/lib/web-orders/types";

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
  unitPriceCents: z.coerce.number().int().min(0).max(1_000_000),
  costCents: z.coerce.number().int().min(0).max(1_000_000),
  marginCents: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  promotionPriceCents: z.union([z.literal(""), z.coerce.number().int().min(0).max(1_000_000)]),
  promotionStartsOn: optionalDate,
  promotionEndsOn: optionalDate,
  active: z.boolean(),
  attributes: z.string().min(1)
}).superRefine((value, context) => {
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
    unitPriceCents: formData.get("unitPriceCents"),
    costCents: formData.get("costCents"),
    marginCents: formData.get("marginCents"),
    promotionPriceCents: formData.get("promotionPriceCents"),
    promotionStartsOn: formData.get("promotionStartsOn"),
    promotionEndsOn: formData.get("promotionEndsOn"),
    active: formData.get("active") === "on",
    attributes: formData.get("attributes")
  });

  const previousAttributes = parseAttributes(input.attributes);
  const attributes: WebOrderJson = {
    ...previousAttributes,
    cost_cents: input.costCents,
    margin_cents: input.marginCents,
    promotion_price_cents: input.promotionPriceCents === "" ? null : input.promotionPriceCents,
    promotion_starts_on: input.promotionStartsOn || null,
    promotion_ends_on: input.promotionEndsOn || null
  };
  const pricingUpdate = {
    unit_price_cents: input.unitPriceCents,
    is_active: input.active,
    attributes
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

async function requireInternalAccess() {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
}

function refresh(saved: string): never {
  revalidatePath("/pedidos-cinturones");
  redirect(`/pedidos-cinturones?saved=${saved}`);
}

function parseAttributes(value: string): Record<string, WebOrderJson | undefined> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
  return parsed as Record<string, WebOrderJson | undefined>;
}
