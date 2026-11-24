import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalShopSlug, promotionPriceSummary, type PromotionPricing } from "./promotion";

export type Promotion = PromotionPricing & {
  slug: string;
  title: string;
  description: string;
  cover_image: string;
  revision: string;
  active: boolean;
};

export const getPromotion = cache(async (slug: string): Promise<Promotion | null> => {
  const { data, error } = await createAdminClient().from("shop_promotions").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
});

export function promotionPath(slug: string) {
  if (slug === generalShopSlug) return "/tienda";
  return "/promociones/" + encodeURIComponent(slug);
}

export function promotionUrl(slug: string, host?: string) {
  const origin = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : process.env.SKBC_PUBLIC_URL || host || "https://skbc.vercel.app";
  return new URL(promotionPath(slug), origin);
}

const promotionDeadlineFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "full", timeStyle: "short", timeZone: "Europe/Madrid"
});

export function promotionPaymentDetails(promotion: Promotion) {
  const expiresAt = Date.parse(promotion.expires_at);
  if (promotion.slug === generalShopSlug || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
  const phone = process.env.SKBC_SHOP_BIZUM_PHONE?.replace(/\s/g, "") ?? "";
  return {
    deadline: promotionDeadlineFormat.format(expiresAt),
    bizumPhone: /^\d{9}$/.test(phone) ? phone.replace(/(\d{3})(?=\d)/g, "$1 ") : ""
  };
}

export function sharePromotion(promotion: Promotion) {
  const includeOffer = promotion.slug !== generalShopSlug && Date.parse(promotion.expires_at) > Date.now();
  const prices = promotion.slug === generalShopSlug ? [] : promotionPriceSummary(promotion.variants, includeOffer);
  const payment = includeOffer ? promotionPaymentDetails(promotion) : undefined;
  const paymentLine = payment ? "Pago hasta el " + payment.deadline + " (último día)." : "";
  const message = [promotion.title, ...prices.slice(0, 8), paymentLine, promotionUrl(promotion.slug).href].filter(Boolean).join("\n");
  return "https://wa.me/?text=" + encodeURIComponent(message);
}

export async function getCatalogOffer(code: string): Promise<Promotion | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await createAdminClient().from("shop_promotions").select("*")
    .eq("code", normalized).eq("active", true).neq("slug", generalShopSlug).maybeSingle();
  if (error) throw error;
  return data;
}