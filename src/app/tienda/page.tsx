import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { generalShopSlug } from "@/lib/shop/promotion";
import { shopSection, type ShopSection } from "@/lib/shop/catalog-sections";
import { promotionCatalogGroups } from "@/lib/shop/promotion-editor-options";
import { getPromotion, shopBizumPhone } from "@/lib/shop/repository";
import { StoreCheckout } from "./store-checkout";
import type { StoreProduct } from "./catalog";
import { clubWebsite, loadMaterialProducts, storeImage } from "./material";
import styles from "./store.module.css";

const edition2027 = new Set(["CAMISETA ADULTOS", "CAMISETA NIÑOS", "SUDADERA ADULTOS", "SUDADERA NIÑOS"]);

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
        edition: section === "club" && edition2027.has(group.title) ? "2027" : undefined,
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
      <div className={styles.headerInner}>
        <a className={styles.brand} href={clubWebsite} aria-label="SKBC Gipuzkoa, web del club">
          <img src="/store-club-emblem.webp" alt="" width={40} height={40} /><span>SKBC Gipuzkoa</span>
        </a>
        <a className={styles.backToClub} href={clubWebsite + "/#merchandising"}>
          <ArrowLeft size={18} aria-hidden="true" /> Volver a la web del club
        </a>
      </div>
    </header>
    <section className={styles.hero}><div className={styles.heroInner}>
      <h1>Tienda del club</h1>
      <p>Dogis, obis, ropa del club y material de entrenamiento.</p>
    </div></section>
    <div className={styles.content}>
      {shop ? <StoreCheckout clothing={products} material={material.status === "fulfilled" ? material.value : []}
        revision={shop.revision} bizumPhone={shopBizumPhone()} /> : <p role="status">La tienda no está disponible en este momento.</p>}
      {material.status === "rejected" ? <p role="status">El catálogo de material no está disponible en este momento.</p> : null}
    </div>
  </main>;
}
