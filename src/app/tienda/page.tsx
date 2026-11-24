import PromotionPage, { generateMetadata as promotionMetadata } from "../promociones/[slug]/page";
import { generalShopSlug } from "@/lib/shop/promotion";

export const dynamic = "force-dynamic";

const catalog = { params: Promise.resolve({ slug: generalShopSlug }) };

export function generateMetadata() {
  return promotionMetadata(catalog);
}

export default function ShopPage() {
  return <PromotionPage {...catalog} />;
}
