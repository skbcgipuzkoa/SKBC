import { ArrowLeft, ArrowUpRight, ChevronRight, Package, Plus, ShoppingBag, Tag } from "lucide-react";
import Link from "next/link";
import { CopyPromotionLink } from "@/app/promociones/copy-link";
import { SidebarNav } from "@/app/components/SidebarNav";
import { listClubMembers } from "@/lib/shop/club-access";
import { requirePromotionAdmin } from "@/lib/shop/admin";
import { euros, generalShopSlug, summarizePromotion } from "@/lib/shop/promotion";
import { promotionCatalogGroups } from "@/lib/shop/promotion-editor-options";
import { getPromotion, promotionPath, promotionUrl, sharePromotion } from "@/lib/shop/repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { listCatalog } from "@/lib/web-orders/repository";
import { SupplierSummary } from "./supplier-summary";
import { PromotionEditor } from "./editor";
import { loadPromotionOrders } from "@/lib/shop/admin-orders";
import { PromotionOrderCard } from "./order-card";
import { publishCatalog } from "./actions";
import styles from "./promotions.module.css";

export const dynamic = "force-dynamic";

const route = "/pedidos-cinturones/promociones";
export default async function ManagePromotions({ searchParams }: {
  searchParams: Promise<{ promo?: string; saved?: string; published?: string; managed?: string; manageFailed?: string; error?: string }>;
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
  const [orders, club] = await Promise.all([
    promotion ? loadPromotionOrders(promotion.slug) : [], promotion?.active ? listClubMembers() : []
  ]);
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
          {params.published ? <p className="save-ok" role="status">Prendas publicadas en la tienda general con sus tallas.</p> : null}
          {params.saved ? <p className="save-ok" role="status">Promoción guardada.</p> : null}
          {params.error ? <p className="form-error" role="alert">{params.error === "manage" ? "No se guardaron los estados. Vuelve a abrir el pedido y comprueba si ha cambiado." : params.error === "expiry" ? "Selecciona un día y una hora válidos en el horario peninsular." : params.error === "publish" ? "Selecciona al menos una prenda y vuelve a cargar si la promoción ha cambiado." : params.error === "invalid" ? "Revisa el código, la fecha y los precios de las variantes." : "No se pudo guardar. Comprueba el identificador y vuelve a cargar si otra persona editó la promoción."}</p> : null}

          {promotion ? <>
            <section className={`card ${styles.panel}`}>
              <div className={styles.panelHeading}>
                <h2>{promotion.title}</h2>
                <a className="secondary-link" href="#pedidos-recibidos">Gestionar pedidos recibidos</a>
                {!isStorefront ? <span className={styles.badge} data-active={promotion.active}>{promotion.active ? "Publicada" : "Borrador"}</span> : null}
              </div>
              {promotion.active ? <div className={styles.actions}>
                <Link className="secondary-link" href={promotionPath(promotion.slug)}>
                  {isStorefront ? "Abrir tienda general" : "Abrir página de la promoción"} <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
                <a className="primary-link" href={sharePromotion(promotion)}>Compartir por WhatsApp</a>
                <CopyPromotionLink url={promotionUrl(promotion.slug).href} />
              </div> : null}
              {promotion.active ? <details className={styles.order}>
                <summary><strong>Lista del club</strong></summary>
                <div className={styles.orderBody}>
                  <p>Comparte el mismo enlace con todo el club. Cada comprador escribe el nombre y los apellidos de la persona a cuyo nombre hace el pedido.</p>
                  {(["adults", "kids"] as const).map(group => <section key={group}>
                    <h3>{group === "adults" ? "Adultos" : "Niños"}</h3>
                    <ul className={styles.lines}>
                      {club.filter(member => member.class === group).map(member => <li key={member.id}>
                        <span>{member.display_name}{member.familyId ? "" : " · Sin unidad familiar"}</span>
                      </li>)}
                    </ul>
                  </section>)}
                </div>
              </details> : null}
              {!isStorefront ? <form className={styles.publish} action={publishCatalog}>
                <h3>Publicar en tienda general</h3>
                <input type="hidden" name="slug" value={promotion.slug} />
                <input type="hidden" name="revision" value={promotion.revision} />
                <div className={styles.checklist}>
                  {promotionCatalogGroups(promotion.variants).map(group => <label key={group.key}>
                    <input type="checkbox" name="catalog_group" value={group.key} />
                    <span><strong>{group.title}</strong><small>{group.sizes.join(" · ")}</small></span>
                  </label>)}
                </div>
                <button className="secondary-link">Publicar prendas seleccionadas</button>
              </form> : null}
            </section>

            <section className={`card ${styles.panel}`}>
              <h2>Resumen consolidado</h2>
              <dl className={styles.metrics}>
                <div><dt>Pedidos</dt><dd>{orders.length}</dd></div>
                <div><dt>Unidades</dt><dd>{summary.reduce((total, line) => total + line.quantity, 0)}</dd></div>
                <div><dt>Importe</dt><dd>{euros.format(consolidatedTotal / 100)}</dd></div>
              </dl>
              <SupplierSummary lines={summary} />
            </section>

            <section className={`card ${styles.panel}`} id="pedidos-recibidos">
              <h2>Pedidos recibidos</h2>
              {orders.length ? <dl className={styles.metrics}>
                <div><dt>Pago pendiente</dt><dd>{orders.filter(order => order.payment_status === "pending").length}</dd></div>
                <div><dt>Pagados</dt><dd>{orders.filter(order => order.payment_status !== "pending").length}</dd></div>
                <div><dt>Entregados</dt><dd>{orders.filter(order => order.delivery_status === "delivered").length}</dd></div>
              </dl> : <p className={styles.empty}><Package size={20} aria-hidden="true" /> Todavía no hay pedidos.</p>}
              {orders.map(order => <PromotionOrderCard key={order.id} order={order} slug={promotion.slug}
                managed={params.managed} manageFailed={params.manageFailed} />)}
            </section>
          </> : null}

          {!isStorefront ? <PromotionEditor key={promotion?.revision ?? "new"} promotion={promotion ?? undefined} catalog={catalog} catalogAvailable={existingCatalog !== null} /> : null}
        </div>
      </div>
    </main>
  </div>;
}
