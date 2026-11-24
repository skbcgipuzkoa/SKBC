import { ArrowLeft, ArrowUpRight, ChevronRight, Package, Plus, ShoppingBag, Tag } from "lucide-react";
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
import styles from "./promotions.module.css";

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
    <main className={`main ${styles.main}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Pedidos del club</p>
          <h1>Pedidos por promoción</h1>
        </div>
        <div className={styles.actions}>
          <Link className="secondary-link" href="/pedidos-cinturones"><ArrowLeft size={16} aria-hidden="true" /> Gestionar pedidos</Link>
          <Link className="primary-link" href={route}><Plus size={16} aria-hidden="true" /> Nueva promoción</Link>
        </div>
      </header>

      <div className={styles.workspace}>
        <nav className={`card ${styles.navigation}`} aria-label="Promociones">
          <h2>Promociones</h2>
          <ul className={styles.navigationList}>
            {list.data.map(item => {
              const store = item.slug === generalShopSlug;
              const Icon = store ? ShoppingBag : Tag;
              return <li key={item.slug}>
                <Link className={styles.navigationLink} aria-current={promotion?.slug === item.slug ? "page" : undefined}
                  href={route + "?promo=" + encodeURIComponent(item.slug)}>
                  <span className={styles.navIcon}><Icon size={18} aria-hidden="true" /></span>
                  <span className={styles.navText}>
                    <strong>{store ? "Tienda general" : item.title}</strong>
                    <small>{store ? "Catálogo y pedidos" : item.active ? "Publicada" : "Borrador"}</small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>;
            })}
          </ul>
          {list.data.every(item => item.slug === generalShopSlug) ? <p className={styles.muted}>Todavía no hay promociones.</p> : null}
        </nav>

        <div className={styles.stack}>
          {params.published ? <p className="save-ok" role="status">Variantes publicadas en la tienda general.</p> : null}
          {params.saved ? <p className="save-ok" role="status">Promoción guardada.</p> : null}
          {params.error ? <p className="form-error" role="alert">{params.error === "expiry" ? "Selecciona un día y una hora válidos en el horario peninsular." : params.error === "publish" ? "Selecciona al menos una variante y vuelve a cargar si la promoción ha cambiado." : params.error === "invalid" ? "Revisa el código, la fecha y los precios de las variantes." : "No se pudo guardar. Comprueba el identificador y vuelve a cargar si otra persona editó la promoción."}</p> : null}

          {promotion ? <>
            <section className={`card ${styles.panel}`}>
              <div className={styles.panelHeading}>
                <h2>{promotion.title}</h2>
                {!isStorefront ? <span className={styles.badge} data-active={promotion.active}>{promotion.active ? "Publicada" : "Borrador"}</span> : null}
              </div>
              {promotion.active ? <div className={styles.actions}>
                <Link className="secondary-link" href={promotionPath(promotion.slug)}>
                  {isStorefront ? "Abrir tienda general" : "Abrir página de la promoción"} <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
                <a className="primary-link" href={sharePromotion(promotion.title, promotion.slug)}>Compartir por WhatsApp</a>
                <CopyPromotionLink url={promotionUrl(promotion.slug).href} />
              </div> : null}
              {!isStorefront ? <form className={styles.publish} action={publishCatalog}>
                <h3>Publicar en tienda general</h3>
                <input type="hidden" name="slug" value={promotion.slug} />
                <input type="hidden" name="revision" value={promotion.revision} />
                <div className={styles.checklist}>
                  {promotion.variants.map(variant => <label key={variant.id}>
                    <input type="checkbox" name="catalog_variant" value={variant.id} /> {variant.product} · {variant.variant}
                  </label>)}
                </div>
                <button className="secondary-link">Publicar variantes seleccionadas</button>
              </form> : null}
            </section>

            <section className={`card ${styles.panel}`}>
              <h2>Resumen consolidado</h2>
              <dl className={styles.metrics}>
                <div><dt>Pedidos</dt><dd>{orders.length}</dd></div>
                <div><dt>Unidades</dt><dd>{summary.reduce((total, line) => total + line.quantity, 0)}</dd></div>
                <div><dt>Importe</dt><dd>{euros.format(consolidatedTotal / 100)}</dd></div>
              </dl>
              {summary.length ? <ul className={styles.lines}>
                {summary.map(line => <li key={JSON.stringify([line.id, line.product, line.variant])}>
                  <span>{line.product} · {line.variant}</span><strong>{line.quantity} uds.</strong>
                </li>)}
              </ul> : null}
            </section>

            <section className={`card ${styles.panel}`}>
              <h2>Pedidos recibidos</h2>
              {!orders.length ? <p className={styles.empty}><Package size={20} aria-hidden="true" /> Todavía no hay pedidos.</p> : null}
              {orders.map(order => <details className={styles.order} key={order.id}>
                <summary><strong>{order.customer}</strong><span>{date.format(new Date(order.created_at))}</span><b>{euros.format(order.total_cents / 100)}</b></summary>
                <div className={styles.orderBody}>
                  <p>Referencia {order.id}</p>
                  <p>Contacto {order.contact}</p>
                  <p>{order.discount_applied ? "Con código de descuento" : "Precio original"}</p>
                  <ul className={styles.lines}>{order.lines.map(line => <li key={line.id}>
                    <span>{line.quantity} × {line.product} · {line.variant}</span><strong>{euros.format(line.price / 100)} por unidad</strong>
                  </li>)}</ul>
                  {order.notes ? <p>{order.notes}</p> : null}
                </div>
              </details>)}
            </section>
          </> : null}

          {!isStorefront ? <PromotionEditor key={promotion?.revision ?? "new"} promotion={promotion ?? undefined} catalog={catalog} catalogAvailable={existingCatalog !== null} /> : null}
        </div>
      </div>
    </main>
  </div>;
}
