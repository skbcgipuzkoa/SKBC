import type { Metadata } from "next";
import { generalShopSlug } from "@/lib/shop/promotion";
import { shopSection, type ShopSection } from "@/lib/shop/catalog-sections";
import { promotionCatalogGroups } from "@/lib/shop/promotion-editor-options";
import { getPromotion } from "@/lib/shop/repository";
import { PromotionBasket } from "../promociones/[slug]/basket";
import { StoreCategories, type StoreProduct } from "./catalog";
import { clubWebsite, loadMaterialProducts, storeImage } from "./material";
import { MaterialStore } from "./material-store";
import styles from "./store.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tienda del club | SKBC Gipuzkoa",
  description: "Consulta y pide dogis, obis, ropa y material de SKBC Gipuzkoa."
};

export default async function ShopPage() {
  const [clothing, material] = await Promise.allSettled([getPromotion(generalShopSlug), loadMaterialProducts()]);
  const shop = clothing.status === "fulfilled" && clothing.value?.active ? clothing.value : null;
  const variants = shop?.variants ?? [];
  const byId = new Map(variants.map(variant => [variant.id, variant]));
  const sections = new Map<ShopSection, typeof variants>();
  for (const variant of variants) {
    const key = shopSection("section" in variant ? variant.section : undefined);
    const rows = sections.get(key);
    if (rows) rows.push(variant);
    else sections.set(key, [variant]);
  }
  const products: StoreProduct[] = [...sections].flatMap(([section, rows]) =>
    promotionCatalogGroups(rows).map(group => {
      const items = group.ids.map(id => byId.get(id)!);
      return {
        id: items[0].id,
        name: group.title,
        section,
        image: items.map(item => storeImage(item.image, "https://skbc.vercel.app")).find(Boolean),
        options: items.map(item => ({
          id: item.id,
          label: group.sizes.includes(item.variant) ? item.variant : item.variant.split(" · ").at(-1) ?? item.variant,
          price: item.original,
          image: storeImage(item.image, "https://skbc.vercel.app")
        }))
      };
    })
  );

  return <main className={styles.shell}>
    <header className={styles.header}>
      <a className={styles.brand} href={clubWebsite}><img src="/ficha-skbc.png" alt="" width={46} height={46} /> SKBC Gipuzkoa</a>
      <a href={clubWebsite + "/#merchandising"}>Volver a la web del club</a>
    </header>
    <section className={styles.hero}><div className={styles.heroInner}>
      <h1>Tienda del club</h1>
      <p>Dogis, obis, ropa del club y material de entrenamiento.</p>
    </div></section>
    <div className={styles.content}>
      <p className={styles.orderNote}>La ropa y el material de entrenamiento se confirman por separado desde esta tienda.</p>
      <StoreCategories>
        {shop && products.length ? <PromotionBasket slug={generalShopSlug} initialRevision={shop.revision} variants={variants} storefront={products} /> : null}
        {material.status === "fulfilled" ? <MaterialStore products={material.value} /> : <p role="status">El catálogo de material no está disponible en este momento. <a href={clubWebsite + "/#merchandising"}>Consultar en la web del club</a></p>}
        {clothing.status === "rejected" ? <p role="status">No se pudo cargar el catálogo de ropa. Vuelve a intentarlo en unos minutos.</p> : null}
      </StoreCategories>
    </div>
  </main>;
}
