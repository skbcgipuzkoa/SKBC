import Link from "next/link";
import { CopyPromotionLink } from "@/app/promociones/copy-link";
import { SidebarNav } from "@/app/components/SidebarNav";
import { requirePromotionAdmin } from "@/lib/shop/admin";
import { euros, generalShopSlug, summarizePromotion, type QuotedLine } from "@/lib/shop/promotion";
import { getPromotion, promotionPath, promotionUrl, sharePromotion } from "@/lib/shop/repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { listCatalog } from "@/lib/web-orders/repository";
import { PromotionEditor } from "./editor";
import { publishCatalog } from "./actions";

export const dynamic = "force-dynamic";

const route = "/pedidos-cinturones/promociones";
type Order = { id: string; customer: string; contact: string; notes: string; created_at: string; lines: (QuotedLine & { offer?: string })[]; promotion_slug: string; total_cents: number; discount_applied: boolean };
const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

async function loadOrders(slug: string) {
  const client = createAdminClient();
  const orders: Order[] = [];
  const pageSize = 200;
  const visibility = slug === generalShopSlug ? "promotion_slug.eq." + slug : "promotion_slug.eq." + slug + ",offer_slug.eq." + slug;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client.from("shop_promotion_orders")
      .select("id,customer,contact,notes,created_at,lines,total_cents,discount_applied,promotion_slug")
      .or(visibility).order("created_at", { ascending: false }).order("id")
      .range(start, start + pageSize - 1).returns<Order[]>();
    if (error) throw error;
    orders.push(...data);
    if (data.length < pageSize) return orders;
  }
}

export default async function ManagePromotions({ searchParams }: {
  searchParams: Promise<{ promo?: string; saved?: string; published?: string; error?: string }>;
}) {
  await requirePromotionAdmin();
  const params = await searchParams;
  const [list, promotion, existingCatalog, storefront] = await Promise.all([
    createAdminClient().from("shop_promotions").select("slug,title,active").order("title"),
    params.promo ? getPromotion(params.promo) : null,
    listCatalog().catch(() => null),
    getPromotion(generalShopSlug)
  ]);
  if (list.error) throw list.error;
  const orders = promotion ? await loadOrders(promotion.slug) : [];
  const selectedLines = orders.map(order => order.promotion_slug === promotion?.slug
    ? order.lines : order.lines.filter(line => line.offer === promotion?.slug));
  const summary = summarizePromotion(selectedLines);
  const consolidatedTotal = selectedLines.flat().reduce((total, line) => total + line.price * line.quantity, 0);
  const websiteCatalog = (existingCatalog ?? []).filter(product => product.is_active).flatMap(product =>
    (product.variants ?? []).filter(variant => variant.is_active).map(variant => ({
      id: variant.id, product: product.name, variant: variant.name, image: product.image_url ?? "",
      original: (variant.unit_price_cents / 100).toFixed(2)
    })));

  const catalog = [...new Map([
    ...websiteCatalog, ...(storefront?.variants ?? []).map(variant => ({
      ...variant, image: variant.image ?? "", original: (variant.original / 100).toFixed(2)
    }))
  ].map(variant => [variant.id, variant])).values()];
  const isStorefront = promotion?.slug === generalShopSlug;

  return <div className="shell">
    <SidebarNav current="/pedidos-cinturones" />
    <main className="main">
      <Link href="/pedidos-cinturones">Volver a Gestionar pedidos</Link>
      <h1>Pedidos por promoción</h1>
      <nav aria-label="Promociones">
        <Link href={route}>Nueva promoción</Link>
        <ul>{list.data.map(item => <li key={item.slug}>
          <Link href={route + "?promo=" + encodeURIComponent(item.slug)}>{item.title}</Link>{item.active ? "" : " · Borrador"}
        </li>)}</ul>
      </nav>
      {params.published ? <p role="status">Variantes publicadas en la tienda general.</p> : null}
      {params.saved ? <p role="status">Promoción guardada.</p> : null}
      {params.error ? <p role="alert">{params.error === "publish" ? "Selecciona al menos una variante y vuelve a cargar si la promoción ha cambiado." : params.error === "invalid" ? "Revisa el código, la fecha y los precios de las variantes." : "No se pudo guardar. Comprueba el identificador y vuelve a cargar si otra persona editó la promoción."}</p> : null}
      {promotion ? <>
        <h2>{promotion.title}</h2>
        {promotion.active ? <p><Link href={promotionPath(promotion.slug)}>{isStorefront ? "Abrir tienda general" : "Abrir página de la promoción"}</Link>{" · "}
          <a href={sharePromotion(promotion.title, promotion.slug)}>Compartir por WhatsApp</a>{" · "}
          <CopyPromotionLink url={promotionUrl(promotion.slug).href} /></p> : null}
        {!isStorefront ? <form action={publishCatalog}>
          <h3>Publicar en tienda general</h3>
          <input type="hidden" name="slug" value={promotion.slug} />
          <input type="hidden" name="revision" value={promotion.revision} />
          {promotion.variants.map(variant => <label key={variant.id}>
            <input type="checkbox" name="catalog_variant" value={variant.id} /> {variant.product} · {variant.variant}
          </label>)}
          <button>Publicar variantes seleccionadas</button>
        </form> : null}
        <section>
          <h3>Resumen consolidado</h3>
          <p>{orders.length} pedidos · {euros.format(consolidatedTotal / 100)}</p>
          <ul>{summary.map(line => <li key={JSON.stringify([line.id, line.product, line.variant])}>{line.quantity} × {line.product} · {line.variant}</li>)}</ul>
        </section>
        <section>
          <h3>Pedidos recibidos</h3>
          {!orders.length ? <p>Todavía no hay pedidos.</p> : null}
          {orders.map(order => <details key={order.id}>
            <summary>{order.customer} · {date.format(new Date(order.created_at))} · {euros.format(order.total_cents / 100)}</summary>
            <p>Referencia {order.id}</p>
            <p>Contacto {order.contact}</p>
            <p>{order.discount_applied ? "Con código de descuento" : "Precio original"}</p>
            <ul>{order.lines.map(line => <li key={line.id}>{line.quantity} × {line.product} · {line.variant} · {euros.format(line.price / 100)} por unidad</li>)}</ul>
            {order.notes ? <p>{order.notes}</p> : null}
          </details>)}
        </section>
      </> : null}
      {!isStorefront ? <section>
        <h2>{promotion ? "Editar promoción" : "Crear promoción"}</h2>
        {!existingCatalog ? <p>El catálogo existente no está disponible en este entorno. Puedes introducir los productos manualmente.</p> : null}
        <PromotionEditor key={promotion?.revision ?? "new"} promotion={promotion ?? undefined} catalog={catalog} />
      </section> : null}
    </main>
  </div>;
}
