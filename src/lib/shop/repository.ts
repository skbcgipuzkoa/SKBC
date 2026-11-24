import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PromotionPricing } from "./promotion";

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
  return "/promociones/" + encodeURIComponent(slug);
}

export function promotionUrl(slug: string, host?: string) {
  const origin = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : process.env.SKBC_PUBLIC_URL || host || "https://skbc.vercel.app";
  return new URL(promotionPath(slug), origin);
}

export function sharePromotion(title: string, slug: string) {
  return "https://wa.me/?text=" + encodeURIComponent(title + "\n" + promotionUrl(slug).href);
}
