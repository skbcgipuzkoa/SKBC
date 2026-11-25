import { euros } from "@/lib/shop/promotion";
import { plannedPaymentLabels, promotionPaymentLabels, promotionDeliveryLabels } from "@/lib/shop/order-management";
import type { PromotionAdminOrder } from "@/lib/shop/admin-orders";
import { updatePromotionOrderManagement } from "./actions";
import styles from "./promotions.module.css";

const date = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

export function PromotionOrderCard({ order, slug, managed, manageFailed, fromCollections, campaign, returnTo }: {
  order: PromotionAdminOrder; slug: string; managed?: string; manageFailed?: string; fromCollections?: boolean; campaign?: string; returnTo?: string;
}) {
  return <article className={styles.order} key={order.id} id={"pedido-" + order.id}>
    <div className={styles.orderManagement}>
      <div className={styles.panelHeading}>
        <h3>{order.customer}</h3>
        <strong>{euros.format(order.total_cents / 100)}</strong>
      </div>
      <div className={styles.orderStatuses}>
        <span className={styles.orderStatus} data-tone={order.payment_status === "pending" ? "red" : "green"}>{promotionPaymentLabels[order.payment_status]}</span>
        <span className={styles.orderStatus} data-tone={order.delivery_status === "delivered" ? "green" : "yellow"}>{promotionDeliveryLabels[order.delivery_status]}</span>
      </div>
      <p>{date.format(new Date(order.created_at))} · Forma de pago prevista: {order.planned_payment_method ? plannedPaymentLabels[order.planned_payment_method] : "Sin indicar"}</p>
      {managed === order.id ? <p className="save-ok" role="status">Estados del pedido guardados.</p> : null}
      {manageFailed === order.id ? <p className="form-error" role="alert">No se guardaron los estados. Revisa los valores actuales antes de volver a guardar.</p> : null}
      <form key={order.management_revision} action={updatePromotionOrderManagement} className={`form-grid ${styles.fields} ${styles.managementFields}`}>
        <input type="hidden" name="id" value={order.id} />
        <input type="hidden" name="slug" value={slug} />
        {fromCollections ? <input type="hidden" name="origin" value="collections" /> : null}
        {campaign ? <input type="hidden" name="campaign" value={campaign} /> : null}
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <input type="hidden" name="revision" value={order.management_revision} />
        <label>Pago<select name="payment" defaultValue={order.payment_status} aria-label={"Pago de " + order.customer}>
          {Object.entries(promotionPaymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Entrega<select name="delivery" defaultValue={order.delivery_status} aria-label={"Entrega de " + order.customer}>
          {Object.entries(promotionDeliveryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button className="secondary-link">Guardar estados</button>
      </form>
    </div>
    <details>
      <summary>Ver prendas y tallas</summary>
      <div className={styles.orderBody}>
        <p>Referencia {order.id}</p>
        {order.contact ? <p>Contacto {order.contact}</p> : null}
        <p>{order.discount_applied ? "Con código de descuento" : "Precio original"}</p>
        <ul className={styles.lines}>{order.lines.map(line => <li key={line.id}>
          <span>{line.quantity} × {line.product} · {line.variant}</span><strong>{euros.format(line.price / 100)} por unidad</strong>
        </li>)}</ul>
        {order.notes ? <p>{order.notes}</p> : null}
        {order.paid_at ? <p>Pago registrado el {date.format(new Date(order.paid_at))}</p> : null}
        {order.delivered_at ? <p>Entrega registrada el {date.format(new Date(order.delivered_at))}</p> : null}
      </div>
    </details>
  </article>;
}
