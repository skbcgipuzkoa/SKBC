import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generalShopSlug } from "@/lib/shop/promotion";
import { getPromotion, promotionUrl, sharePromotion } from "@/lib/shop/repository";
import { PromotionPhoto } from "./photo";
import { PromotionBasket } from "./basket";
import styles from "./promotion.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const promotion = await getPromotion((await params).slug);
  if (!promotion?.active) return { title: "Promoción no disponible" };
  return {
    title: promotion.title + " | SKBC GIPUZKOA",
    description: promotion.description,
    robots: { index: false, follow: false },
    openGraph: {
      title: promotion.title, description: promotion.description, siteName: "SKBC GIPUZKOA",
      images: [new URL(promotion.cover_image || promotion.variants[0]?.image || "/ficha-skbc.png", promotionUrl(promotion.slug)).href]
    }
  };
}

export default async function PromotionPage({ params }: Props) {
  const promotion = await getPromotion((await params).slug);
  if (!promotion?.active) notFound();

  return <main className={styles.page}>
    <header className={styles.hero}>
      <img src="/ficha-skbc.png" alt="SKBC GIPUZKOA" width={72} height={72} />
      <h1>{promotion.title}</h1>
      <p>{promotion.description}</p>
      {promotion.cover_image ? <PromotionPhoto className={styles.coverPhoto} src={promotion.cover_image} alt="Diseño de la equipación" /> : null}
      <a href={sharePromotion(promotion)}>Compartir por WhatsApp</a>
    </header>
    {promotion.slug === generalShopSlug && !promotion.variants.length ? <p>Todavía no hay productos publicados.</p> : <PromotionBasket slug={promotion.slug} initialRevision={promotion.revision} variants={promotion.variants.map(({ id, product, variant, original, offer, image }) => ({
      id, product, variant, original, image,
      advertisedOffer: promotion.slug !== generalShopSlug && Date.parse(promotion.expires_at) > Date.now() ? offer : undefined
    }))} />}
  </main>;
}
