"use server";

import { appendClassReturn, safeClassReturnPath } from "@/lib/class-return";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { promotionCatalogGroups, promotionDeadline } from "@/lib/shop/promotion-editor-options";
import { getPromotion } from "@/lib/shop/repository";
import { requirePromotionAdmin } from "@/lib/shop/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const money = z.string().trim().regex(/^\d{1,5}([.,]\d{1,2})?$/)
  .transform(value => Math.round(Number(value.replace(",", ".")) * 100));
const image = z.string().trim().max(2048).refine(value => !value || /^\/(?!\/)[\w/.-]+$/.test(value) ||
  /^https:\/\/[^\s]+$/.test(value));
const slugSchema = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const schema = z.object({
  slug: slugSchema,
  revision: z.string().uuid().or(z.literal("")),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000),
  cover_image: image,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,50}$/),
  expires_at: z.string().datetime({ offset: true }),
  active: z.boolean(),
  variants: z.array(z.object({
    id: z.string().uuid(),
    product: z.string().trim().min(1).max(160),
    variant: z.string().trim().min(1).max(160),
    image,
    original: money,
    offer: money
  }).refine(item => item.offer <= item.original)).min(1).max(200)
}).refine(promotion => new Set(promotion.variants.map(item => item.id)).size === promotion.variants.length);

export async function savePromotion(form: FormData) {
  await requirePromotionAdmin();
  const slug = String(form.get("slug") ?? "");
  const base = "/pedidos-cinturones/promociones";
  const back = base + "?promo=" + encodeURIComponent(slug);
  let variants: unknown;
  try {
    variants = JSON.parse(String(form.get("variants") ?? ""));
  } catch {
    redirect(back + "&error=invalid");
  }
  const expiresAt = form.has("expiry_day")
    ? promotionDeadline(String(form.get("expiry_day") ?? ""), String(form.get("expiry_time") ?? ""), String(form.get("previous_expiry") ?? ""))
    : form.get("expires_at");
  if (!expiresAt) redirect(back + "&error=expiry");
  const parsed = schema.safeParse({
    slug, variants,
    revision: form.get("revision"),
    title: form.get("title"),
    description: form.get("description"),
    cover_image: form.get("cover_image"),
    code: form.get("code"),
    expires_at: expiresAt,
    active: form.has("active")
  });
  if (!parsed.success) redirect(back + "&error=invalid");

  const { revision, ...data } = parsed.data;
  const table = createAdminClient().from("shop_promotions");
  const next = { ...data, slug: revision ? slug : slug.slice(0, 86).replace(/-+$/, "") + "-" + randomBytes(16).toString("hex"), revision: randomUUID() };
  const result = revision
    ? await table.update(next).eq("slug", slug).eq("revision", revision).select("slug").maybeSingle()
    : await table.insert(next).select("slug").single();
  if (result.error || !result.data) redirect(back + "&error=save");
  redirect(base + "?promo=" + encodeURIComponent(next.slug) + "&saved=1");
}

export async function publishCatalog(form: FormData) {
  await requirePromotionAdmin();
  const parsed = z.object({ slug: slugSchema, revision: z.string().uuid(), groups: z.array(z.string().max(512)).min(1).max(200), section: z.enum(["gi", "belt", "club", "other"]) })
    .safeParse({ slug: form.get("slug"), revision: form.get("revision"), groups: form.getAll("catalog_group"), section: form.get("section") });
  if (!parsed.success) redirect("/pedidos-cinturones/promociones?error=publish");
  const { slug, revision, groups, section } = parsed.data;
  const back = "/pedidos-cinturones/promociones?promo=" + encodeURIComponent(slug);
  const promotion = await getPromotion(slug);
  if (!promotion || promotion.revision !== revision) redirect(back + "&error=publish");

  const keys = new Set(groups);
  const selected = promotionCatalogGroups(promotion.variants).filter(group => keys.has(group.key));
  if (selected.length !== keys.size) redirect(back + "&error=publish");
  const ids = selected.flatMap(group => group.ids);
  const { data, error } = await createAdminClient().rpc("shop_publish_catalog", {
    p_slug: slug, p_revision: revision, p_variants: ids, p_section: section
  });
  redirect(back +
    (error || !data ? "&error=publish" : "&published=1"));
}
export async function uploadPromotionImage(form: FormData) {
  await requirePromotionAdmin();
  const file = form.get("image");
  if (!(file instanceof File) || !file.size || file.size > 4_000_000) {
    return { error: "Selecciona una imagen de hasta 4 MB." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const format = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? { mime: "image/jpeg", ext: "jpg" }
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? { mime: "image/png", ext: "png" }
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? { mime: "image/webp", ext: "webp" }
    : null;
  if (!format) return { error: "Usa una imagen JPG, PNG o WebP." };

  const storage = createAdminClient().storage.from("skbc-shop-images");
  const path = randomUUID() + "." + format.ext;
  const { error } = await storage.upload(path, bytes, { contentType: format.mime, cacheControl: "31536000" });
  if (error) return { error: "No se pudo subir la imagen. Inténtalo de nuevo." };
  return { url: storage.getPublicUrl(path).data.publicUrl };
}

function orderManagementLocation(form: FormData) {
  const fromCollections = form.get("origin") === "collections";
  const campaign = z.string().uuid().safeParse(form.get("campaign"));
  const returnTo = form.get("returnTo");
  const collectionsPath = appendClassReturn("/pedidos-cinturones?tab=payments" + (campaign.success ? "&campaign=" + campaign.data : ""), safeClassReturnPath(typeof returnTo === "string" ? returnTo : undefined));
  return { fromCollections, collectionsPath };
}

export async function updatePromotionOrderManagement(form: FormData) {
  await requirePromotionAdmin();
  const { fromCollections, collectionsPath } = orderManagementLocation(form);
  const parsed = z.object({
    slug: slugSchema,
    id: z.string().uuid(),
    revision: z.string().uuid(),
    payment: z.enum(["pending", "bizum", "cash"]),
    delivery: z.enum(["pending", "delivered"])
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(fromCollections ? collectionsPath + "&manageFailed=invalid" : "/pedidos-cinturones/promociones?error=manage");

  const { slug, id, revision, payment, delivery } = parsed.data;
  const { data, error } = await createAdminClient().rpc("shop_update_order_management", {
    p_id: id, p_context_slug: slug, p_revision: revision, p_payment: payment, p_delivery: delivery
  });
  const returnPath = fromCollections ? collectionsPath : "/pedidos-cinturones/promociones?promo=" + encodeURIComponent(slug);
  redirect(returnPath +
    (error || !data ? "&manageFailed=" : "&managed=") + id + "#pedido-" + id);
}

export async function deletePromotionOrder(form: FormData) {
  await requirePromotionAdmin();
  const { fromCollections, collectionsPath } = orderManagementLocation(form);
  const parsed = z.object({
    slug: slugSchema,
    id: z.string().uuid(),
    revision: z.string().uuid(),
    confirmed: z.literal("yes")
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(fromCollections ? collectionsPath + "&deleteFailed=1" : "/pedidos-cinturones/promociones?deleteFailed=1");

  const { slug, id, revision } = parsed.data;
  const { data, error } = await createAdminClient().rpc("shop_delete_order", {
    p_id: id, p_context_slug: slug, p_revision: revision
  });
  const returnPath = fromCollections ? collectionsPath : "/pedidos-cinturones/promociones?promo=" + encodeURIComponent(slug);
  redirect(returnPath + (error || !data ? "&deleteFailed=1" : "&deleted=1") + "#resultado-borrado");
}
