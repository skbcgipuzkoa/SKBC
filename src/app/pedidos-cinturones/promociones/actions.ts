"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { promotionDeadline } from "@/lib/shop/promotion-editor-options";
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
  const parsed = z.object({ slug: slugSchema, revision: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(200) })
    .safeParse({ slug: form.get("slug"), revision: form.get("revision"), ids: form.getAll("catalog_variant") });
  if (!parsed.success) redirect("/pedidos-cinturones/promociones?error=publish");
  const { slug, revision, ids } = parsed.data;
  const { data, error } = await createAdminClient().rpc("shop_publish_catalog", {
    p_slug: slug, p_revision: revision, p_variants: ids
  });
  redirect("/pedidos-cinturones/promociones?promo=" + encodeURIComponent(slug) +
    (error || !data ? "&error=publish" : "&published=1"));
}