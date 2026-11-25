import { promotionCatalogGroups } from "@/lib/shop/promotion-editor-options";
import { shopSection, type ShopSection } from "@/lib/shop/catalog-sections";
import { generalShopSlug } from "@/lib/shop/promotion";
import { getPromotion } from "@/lib/shop/repository";

export const dynamic = "force-dynamic";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store"
};

export async function GET() {
  try {
    const catalog = await getPromotion(generalShopSlug);
    const variants = catalog?.active ? catalog.variants : [];
    const bySection = new Map<ShopSection, typeof variants>();
    for (const variant of variants) {
      const section = shopSection("section" in variant ? variant.section : undefined);
      const sectionVariants = bySection.get(section);
      if (sectionVariants) sectionVariants.push(variant);
      else bySection.set(section, [variant]);
    }
    const byId = new Map(variants.map(variant => [variant.id, variant]));
    const products = Array.from(bySection, ([section, sectionVariants]) =>
      promotionCatalogGroups(sectionVariants).map(group => {
        const items = group.ids.map(id => byId.get(id)!);
        return {
          name: group.title,
          section,
          sizes: group.sizes,
          prices: [...new Set(items.map(item => item.original))],
          image: items.find(item => item.image)?.image
        };
      })
    ).flat();
    return Response.json({ products }, { headers });
  } catch {
    return Response.json({ error: "Catálogo no disponible" }, { headers, status: 503 });
  }
}
