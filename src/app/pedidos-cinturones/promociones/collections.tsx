import { requirePromotionAdmin } from "@/lib/shop/admin";
import { loadPromotionOrders, type PromotionAdminOrder } from "@/lib/shop/admin-orders";
import { generalShopSlug } from "@/lib/shop/promotion";
import { createAdminClient } from "@/lib/supabase/admin";
import { PromotionOrderCard } from "./order-card";
import styles from "./promotions.module.css";

export async function PromotionCollections({ managed, manageFailed, campaign, returnTo }: {
  managed?: string;
  manageFailed?: string;
  campaign?: string;
  returnTo?: string;
}) {
  if (process.env.NODE_ENV === "production" && !process.env.SKBC_INTERNAL_ACCESS_CODE?.trim()) return null;
  await requirePromotionAdmin();

  let groups: Map<string, PromotionAdminOrder[]>;
  let titles: Map<string, string>;
  try {
    const [orders, promotions] = await Promise.all([
      loadPromotionOrders(),
      createAdminClient().from("shop_promotions").select("slug,title")
    ]);
    if (promotions.error) throw promotions.error;
    titles = new Map(promotions.data.map(({ slug, title }) => [slug, title]));
    groups = new Map();
    for (const order of orders) {
      const slug = order.offer_slug ?? order.promotion_slug;
      const group = groups.get(slug);
      if (group) group.push(order);
      else groups.set(slug, [order]);
    }
  } catch {
    return <section className={`panel ${styles.panel}`}>
      <h2>Cobros de promociones</h2>
      <p role="alert" className="form-error">No se pudieron cargar los pedidos de la tienda. Recarga la página para volver a intentarlo.</p>
    </section>;
  }

  return <section className={`panel ${styles.panel}`} aria-labelledby="promotion-collections-heading">
    <h2 id="promotion-collections-heading">Cobros de promociones</h2>
    {manageFailed === "invalid" ? <p className="form-error" role="alert">No se pudo guardar el pedido. Revisa los datos y vuelve a intentarlo.</p> : null}
    {groups.size === 0 ? <p>Todavía no hay pedidos de la tienda.</p> : null}
    {Array.from(groups, ([slug, orders]) => {
      const title = slug === generalShopSlug ? "Tienda general" : titles.get(slug) ?? slug;
      const paid = orders.filter(order => order.payment_status !== "pending").length;
      const delivered = orders.filter(order => order.delivery_status === "delivered").length;
      const recentlyEdited = orders.some(order => order.id === managed || order.id === manageFailed);
      return <details key={slug} className={`material-section ${styles.collectionGroup}`} open={recentlyEdited || undefined}>
        <summary className="material-section-heading">
          <h3>Pedido conjunto · {title}</h3>
          <div className={styles.orderStatuses}>
            <span>{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</span>
            <span className={styles.orderStatus} data-tone={paid === orders.length ? "green" : paid ? "yellow" : "red"}>{paid}/{orders.length} pagados</span>
            <span className={styles.orderStatus} data-tone={delivered === orders.length ? "green" : delivered || paid ? "yellow" : "red"}>{delivered}/{orders.length} entregados</span>
          </div>
        </summary>
        <div className={styles.collectionOrders}>
          {orders.map(order => <PromotionOrderCard key={order.id} order={order} slug={slug}
            managed={managed} manageFailed={manageFailed} campaign={campaign} returnTo={returnTo} fromCollections />)}
        </div>
      </details>;
    })}
  </section>;
}
