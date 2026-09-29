"use client";

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Download, PackageCheck, ReceiptText, UsersRound } from "lucide-react";
import { SubmitButton } from "@/app/components/SubmitButton";
import {
  assignMaterialPaymentAction,
  closeMaterialCampaignAction,
  createMaterialVariantAction,
  reconcileMaterialCommunicationAction,
  sendMaterialCampaignCommunicationsAction,
  updateMaterialFamilyPaymentAction,
  updateMaterialProductAction,
  updateMaterialVariantAction
} from "@/app/material-order-actions";
import type { CampaignOrder, CatalogProduct, SupplierSummaryRow } from "@/lib/web-orders/repository";
import type { ManagementCampaignStatus } from "@/lib/web-orders/campaigns";
import type { WebOrderCampaign, WebOrderCommunication, WebOrderFamilyPayment, WebOrderJson } from "@/lib/web-orders/types";

type CampaignView = Omit<WebOrderCampaign, "status"> & { status: ManagementCampaignStatus };
type CommunicationView = WebOrderCommunication & {
  status: "prepared" | "sending" | "sent" | "failed" | "delivered_unconfirmed";
};

export type MaterialOrdersDashboardProps = {
  campaign: CampaignView | null;
  campaigns: CampaignView[];
  orders: CampaignOrder[];
  historyOrders: CampaignOrder[];
  supplierSummary: SupplierSummaryRow[];
  catalog: CatalogProduct[];
  communications: CommunicationView[];
  familyPayments: WebOrderFamilyPayment[];
  loadError?: string;
  initialTab?: TabId;
  children: ReactNode;
};

const tabs = [
  ["monthly", "Material mensual"],
  ["supplier", "Resumen proveedor"],
  ["payments", "Cobros y comunicaciones"],
  ["catalog", "Catálogo"],
  ["history", "Histórico"],
  ["belts", "Cinturones de examen"]
] as const;

type TabId = (typeof tabs)[number][0];

export function MaterialOrdersDashboard(props: MaterialOrdersDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>(props.initialTab ?? (props.loadError ? "belts" : "monthly"));
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    monthly: null,
    supplier: null,
    payments: null,
    catalog: null,
    history: null,
    belts: null
  });
  const totals = useMemo(() => summarize(props.orders), [props.orders]);
  const unresolved = unresolvedOrderCount(props.orders);

  function selectAdjacentTab(event: KeyboardEvent<HTMLButtonElement>, currentId: TabId) {
    const currentIndex = tabs.findIndex(([id]) => id === currentId);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextId = tabs[nextIndex][0];
    setActiveTab(nextId);
    tabRefs.current[nextId]?.focus();
  }

  return <div className="material-orders">
    <form className="material-campaign-selector" action="/pedidos-cinturones">
      <label>Campaña seleccionada<select name="campaign" defaultValue={props.campaign?.id ?? ""}>{props.campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{formatPeriod(campaign)} · {statusLabel(campaign.status)}</option>)}</select></label>
      <button type="submit" className="secondary-button">Abrir campaña</button>
    </form>
    <nav className="material-tabs" aria-label="Vistas de pedidos" role="tablist">
      {tabs.map(([id, label]) => <button key={id} ref={(element) => { tabRefs.current[id] = element; }} id={`material-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`material-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} onClick={() => setActiveTab(id)} onKeyDown={(event) => selectAdjacentTab(event, id)}>{label}</button>)}
    </nav>

    {props.loadError ? <div className="material-alert material-alert-danger" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span><strong>Pedidos mensuales no disponibles.</strong> {props.loadError}</span></div> : null}

    <div id="material-panel-monthly" role="tabpanel" aria-labelledby="material-tab-monthly" hidden={activeTab !== "monthly"}>{activeTab === "monthly" ? <MonthlyView {...props} totals={totals} unresolved={unresolved} /> : null}</div>
    <div id="material-panel-supplier" role="tabpanel" aria-labelledby="material-tab-supplier" hidden={activeTab !== "supplier"}>{activeTab === "supplier" ? <SupplierView rows={props.supplierSummary} campaign={props.campaign} /> : null}</div>
    <div id="material-panel-payments" role="tabpanel" aria-labelledby="material-tab-payments" hidden={activeTab !== "payments"}>{activeTab === "payments" ? <PaymentsView orders={props.orders} communications={props.communications} campaign={props.campaign} familyPayments={props.familyPayments} /> : null}</div>
    <div id="material-panel-catalog" role="tabpanel" aria-labelledby="material-tab-catalog" hidden={activeTab !== "catalog"}>{activeTab === "catalog" ? <CatalogView products={props.catalog} /> : null}</div>
    <div id="material-panel-history" role="tabpanel" aria-labelledby="material-tab-history" hidden={activeTab !== "history"}>{activeTab === "history" ? <HistoryView campaigns={props.campaigns} orders={props.historyOrders} /> : null}</div>
    <div id="material-panel-belts" role="tabpanel" aria-labelledby="material-tab-belts" hidden={activeTab !== "belts"} className="material-belt-workflow">{activeTab === "belts" ? props.children : null}</div>
  </div>;
}

function MonthlyView({ campaign, orders, communications, totals, unresolved }: MaterialOrdersDashboardProps & { totals: ReturnType<typeof summarize>; unresolved: number }) {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("");
  const [size, setSize] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  if (!campaign) return <EmptyState title="No hay campaña activa" detail="La campaña mensual todavía no existe en la base de datos de la web." />;
  const expectedCommunications = new Set(orders.filter((order) => order.status !== "cancelled").map((order) => order.customer_email?.trim().toLowerCase()).filter(Boolean)).size;
  const closeDisabled = campaign.status !== "pending_close" || unresolved > 0 || orders.length === 0;
  const products = [...new Set(orders.flatMap((order) => order.items.map((item) => item.product_name)))].sort();
  const sizes = [...new Set(orders.flatMap((order) => order.items.map((item) => item.variant_name)))].sort();

  return <div className="material-tab-panel">
    <section className="material-campaign-head">
      <div><p className="eyebrow">Campaña actual</p><h2>{formatPeriod(campaign)}</h2><p>{campaignMessage(campaign)}</p></div>
      <span className={`material-status status-${campaign.status}`}>{statusLabel(campaign.status)}</span>
    </section>

    <section className="material-metrics" aria-label="Resumen de campaña">
      <Metric icon={<CalendarClock size={19} />} label="Plazo" value={daysLabel(campaign)} />
      <Metric icon={<UsersRound size={19} />} label="Pedidos" value={String(totals.orderCount)} />
      <Metric icon={<PackageCheck size={19} />} label="Artículos" value={String(totals.articleCount)} />
      <Metric icon={<ReceiptText size={19} />} label="Importe público" value={money(totals.totalCents)} />
    </section>

    <section className="material-alerts" aria-label="Alertas administrativas">
      {unresolved ? <div className="material-alert material-alert-danger"><AlertTriangle size={18} /><span><strong>{unresolved} pedidos requieren revisión.</strong> Falta email, teléfono o forma de pago.</span></div> : <div className="material-alert material-alert-ok"><CheckCircle2 size={18} /><span>Los datos obligatorios están completos.</span></div>}
      {campaign.status === "pending_close" ? <div className="material-alert material-alert-warn"><CalendarClock size={18} /><span>El periodo terminó. Revisa cobros y cierra la campaña manualmente.</span></div> : null}
    </section>

    <section className="material-section">
      <div className="material-section-heading"><div><h3>Detalle de artículos</h3><p>Una fila por artículo solicitado. Las líneas de una familia no se combinan.</p></div><span>{totals.articleCount} unidades</span></div>
      <div className="material-filters" aria-label="Filtros de artículos">
        <label>Responsable o destinatario<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre o pedido" /></label>
        <label>Producto<select value={product} onChange={(event) => setProduct(event.target.value)}><option value="">Todos</option>{products.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Talla<select value={size} onChange={(event) => setSize(event.target.value)}><option value="">Todas</option>{sizes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Estado<select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)}><option value="">Todos</option><option value="pending">Pendiente</option><option value="seen">Revisado</option><option value="contacted">Contactado</option><option value="payment_pending">Pago pendiente</option><option value="paid">Pagado</option><option value="delivered">Entregado</option><option value="cancelled">Cancelado</option></select></label>
      </div>
      <OrderLinesTable orders={orders} query={query} product={product} size={size} orderStatus={orderStatus} />
    </section>

    <section className="material-close-band">
      <div><h3>Cierre de campaña</h3><p>El cierre congela {orders.length} pedidos y prepara {expectedCommunications} comunicaciones. No envía ningún email.</p>{unresolved ? <strong>Resuelve {unresolved} pedidos antes de continuar.</strong> : null}</div>
      <form action={closeMaterialCampaignAction} onSubmit={(event) => confirmClose(event, orders.length, expectedCommunications)}>
        <input type="hidden" name="campaignId" value={campaign.id} />
        <input type="hidden" name="expectedOrderCount" value={orders.length} />
        <input type="hidden" name="expectedCommunicationCount" value={expectedCommunications} />
        <input type="hidden" name="unresolvedCount" value={unresolved} />
        <CloseCampaignButton disabled={closeDisabled} />
      </form>
    </section>
    {communications.length ? <p className="material-footnote">{communications.length} comunicaciones ya constan en esta campaña.</p> : null}
  </div>;
}

function SupplierView({ rows, campaign }: { rows: SupplierSummaryRow[]; campaign: CampaignView | null }) {
  const total = rows.reduce((sum, row) => sum + row.totalCostCents, 0);
  return <div className="material-tab-panel">
    <section className="material-section">
      <div className="material-section-heading"><div><h2>Resumen para proveedor</h2><p>{campaign ? formatPeriod(campaign) : "Sin campaña activa"}. Agrupado exclusivamente por referencia y talla.</p></div>
        <button type="button" className="secondary-button material-icon-action" disabled={!rows.length} onClick={() => exportSupplierCsv(rows)}><Download size={17} /> Exportar CSV</button>
      </div>
      <div className="table-wrap material-table"><table><thead><tr><th>Referencia</th><th>Producto</th><th>Talla</th><th>Cantidad</th><th>Coste unitario</th><th>Coste total</th></tr></thead><tbody>
        {rows.length ? rows.map((row) => <tr key={`${row.supplierReference}-${row.size}`}><td data-label="Referencia"><strong>{row.supplierReference}</strong></td><td data-label="Producto">{row.productName}</td><td data-label="Talla">{row.size}</td><td data-label="Cantidad">{row.quantity}</td><td data-label="Coste unitario">{money(row.unitCostCents)}</td><td data-label="Coste total"><strong>{money(row.totalCostCents)}</strong></td></tr>) : <tr><td colSpan={6} className="muted">No hay artículos para agrupar.</td></tr>}
      </tbody><tfoot><tr><td colSpan={5}>Total estimado</td><td>{money(total)}</td></tr></tfoot></table></div>
    </section>
  </div>;
}

function PaymentsView({ orders, communications, campaign, familyPayments }: { orders: CampaignOrder[]; communications: CommunicationView[]; campaign: CampaignView | null; familyPayments: WebOrderFamilyPayment[] }) {
  const communicationIds = JSON.stringify(communications.map((communication) => communication.id));
  const pending = communications.filter((communication) => communication.status === "prepared" || communication.status === "failed");
  const pendingIds = JSON.stringify(pending.map((communication) => communication.id));
  const sentIds = JSON.stringify(communications.filter((communication) => communication.status === "sent").map((communication) => communication.id));
  const pendingCount = pending.length;
  const sentCount = communications.filter((communication) => communication.status === "sent").length;
  const ambiguousCount = communications.filter((communication) => communication.status === "sending" || communication.status === "delivered_unconfirmed").length;
  const paymentTotal = familyPayments.reduce((sum, payment) => sum + payment.total_cents, 0);
  const cashReceived = familyPayments.filter((payment) => payment.status === "cash_paid").reduce((sum, payment) => sum + payment.total_cents, 0);
  const bankSubmitted = familyPayments.filter((payment) => payment.status === "bank_submitted").reduce((sum, payment) => sum + payment.total_cents, 0);
  const paymentPending = familyPayments.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + payment.total_cents, 0);
  return <div className="material-tab-panel">
    <section className="material-section">
      <div className="material-section-heading"><div><h2>Cobros</h2><p>La forma de pago se asigna por responsable y se incluirá en la comunicación preparada.</p></div></div>
      <div className="material-payment-list">{orders.length ? orders.map((order) => <div className="material-payment-row" key={order.id}><div><strong>{order.customer_name}</strong><span>{order.order_number ?? "Sin número"} · {order.customer_email ?? "Sin email"}</span></div><strong>{money(order.total_cents ?? order.items.reduce((sum, item) => sum + item.line_total_cents, 0))}</strong><form action={assignMaterialPaymentAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="campaignId" value={campaign?.id ?? ""} /><select name="paymentMethod" defaultValue={order.payment_method ?? ""} aria-label={`Pago de ${order.customer_name}`} required disabled={campaign?.status === "closed"}><option value="" disabled>Asignar pago</option><option value="cash">Entregar en el club</option><option value="bank">Cargar en cuenta</option><option value="paid">Pagado</option></select><PaymentSubmitButton disabled={campaign?.status === "closed"} /></form></div>) : <p className="muted">No hay pedidos en la campaña.</p>}</div>
    </section>
    <section className="material-section">
      <div className="material-section-heading"><div><h2>Seguimiento de pagos por familia</h2><p>El último pedido enviado se recupera tal como se comunicó. Cada familia aparece una sola vez, aunque tenga varios alumnos o artículos.</p></div><span>{familyPayments.length} familias</span></div>
      <div className="material-payment-summary"><Metric icon={<ReceiptText size={18} />} label="Total pedido" value={money(paymentTotal)} /><Metric icon={<CalendarClock size={18} />} label="Pendiente" value={money(paymentPending)} /><Metric icon={<CheckCircle2 size={18} />} label="Efectivo recibido" value={money(cashReceived)} /><Metric icon={<PackageCheck size={18} />} label="Enviado al banco" value={money(bankSubmitted)} /></div>
      <div className="material-family-payment-list">{familyPayments.length ? familyPayments.map((payment) => <FamilyPaymentRow key={payment.id} payment={payment} />) : <EmptyState title="Sin pagos familiares recuperados" detail="Los pagos aparecerán al cerrar una campaña y preparar sus comunicaciones familiares." />}</div>
    </section>
    <section className="material-section">
      <div className="material-section-heading"><div><h2>Comunicaciones</h2><p>{campaign?.status === "closed" ? "Revisa los destinatarios y envía primero una prueba interna. Cada familia recibe un único email con todos sus pedidos." : "Se prepararán al cerrar la campaña; nunca se envían automáticamente."}</p></div><span>{pendingCount} pendientes · {sentCount} enviadas · {ambiguousCount} por conciliar</span></div>
      {communications.length ? <><div className="material-communication-list">{communications.map((communication) => <details key={communication.id}><summary><span><strong>{communication.recipient_name || communication.subject || "Comunicación de pedido"}</strong><small>{communication.recipient_email ?? "Sin email"} · {communication.status}</small></span><b>Revisar</b></summary>{communication.body ? <pre>{communication.body}</pre> : <p className="muted">El email profesional se generará desde la instantánea congelada de la familia.</p>}{communication.failure_message ? <p className="form-error">{communication.failure_message}</p> : null}{campaign && communication.attempt_token && (communication.status === "sending" || communication.status === "delivered_unconfirmed") ? <form action={reconcileMaterialCommunicationAction} onSubmit={(event) => { if (!window.confirm("Confirma el resultado verificado manualmente. Esta decisión quedará auditada.")) event.preventDefault(); }}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="communicationId" value={communication.id} /><input type="hidden" name="attemptToken" value={communication.attempt_token} /><input type="hidden" name="reconcileConfirmed" value="yes" /><label>Resultado verificado<select name="delivered" required defaultValue=""><option value="" disabled>Seleccionar</option><option value="yes">Entregado</option><option value="no">No entregado; permitir reintento</option></select></label><button type="submit" className="secondary-button">Conciliar intento</button></form> : null}</details>)}</div>
        {campaign?.status === "closed" ? <div className="material-campaign-actions">
          <form action={sendMaterialCampaignCommunicationsAction}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="communicationIds" value={communicationIds} /><button className="secondary-button" type="submit" name="mode" value="test">Enviar prueba al club</button></form>
          <form action={sendMaterialCampaignCommunicationsAction} onSubmit={(event) => { if (!window.confirm(`Se procesarán ${pendingCount} comunicaciones pendientes, una por familia. ¿Continuar?`)) event.preventDefault(); }}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="communicationIds" value={pendingIds} /><label className="check-row"><input type="checkbox" name="sendConfirmed" value="yes" required /> Confirmo el envío final de esta campaña cerrada</label><button type="submit" name="mode" value="send" disabled={!pendingCount}>Enviar pendientes</button></form>
          {sentCount ? <form action={sendMaterialCampaignCommunicationsAction} onSubmit={(event) => { if (!window.confirm(`Esto reenviará ${sentCount} comunicaciones ya enviadas. ¿Confirmas el reenvío forzado?`)) event.preventDefault(); }}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="communicationIds" value={sentIds} /><input type="hidden" name="forceConfirmed" value="yes" /><label className="check-row"><input type="checkbox" name="sendConfirmed" value="yes" required /> Confirmo el reenvío forzado</label><button className="danger-button" type="submit" name="mode" value="force-resend">Forzar reenvío de enviadas</button></form> : null}
        </div> : null}</> : <EmptyState title="Sin comunicaciones preparadas" detail="Cierra la campaña cuando todos los datos estén revisados." />}
    </section>
  </div>;
}

function FamilyPaymentRow({ payment }: { payment: WebOrderFamilyPayment }) {
  const statuses = [
    ["pending", "Pendiente"],
    ["cash_paid", "Pagado"],
    ["bank_submitted", "Pasado por cuenta"]
  ] as const;
  return <article className={`material-family-payment status-${payment.status}`}>
    <form action={updateMaterialFamilyPaymentAction}>
      <input type="hidden" name="paymentId" value={payment.id} />
      <input type="hidden" name="campaignId" value={payment.campaign_id} />
      <div className="material-family-payment-main">
        <div className="material-family-payment-person"><strong>{payment.recipient_name}</strong><small>{familyRecipients(payment.recipients)} · {paymentMethodLabel(payment.intended_payment_method)}</small></div>
        <strong className="material-family-payment-total">{money(payment.total_cents)}</strong>
        <fieldset className="material-payment-statuses" aria-label={`Estado de pago de ${payment.recipient_name}`}>
          {statuses.map(([status, label]) => <label key={status} className={`payment-choice choice-${status}`}><input type="radio" name="status" value={status} defaultChecked={payment.status === status} onChange={(event) => event.currentTarget.form?.requestSubmit()} /><span>{label}</span></label>)}
        </fieldset>
      </div>
      <details className="material-family-payment-detail"><summary>Ver desglose y notas</summary><div className="material-family-payment-body"><ul>{familyItems(payment.items).map((item, index) => <li key={`${payment.id}-${index}`}><span>{item.label}</span><strong>{item.amount}</strong></li>)}</ul><div className="material-payment-notes"><label>Notas<input name="notes" defaultValue={payment.notes ?? ""} placeholder="Fecha, persona que entrega o aclaración" /></label><SubmitButton pendingLabel="Guardando...">Guardar nota</SubmitButton></div>{payment.status_on ? <small className="material-payment-date">Actualizado el {formatDate(payment.status_on)}</small> : null}</div></details>
    </form>
  </article>;
}

function CatalogView({ products }: { products: CatalogProduct[] }) {
  return <div className="material-tab-panel"><section className="material-section"><div className="material-section-heading"><div><h2>Catálogo público</h2><p>Coste, margen, precio final, disponibilidad y promoción por variante.</p></div><span>{products.length} productos</span></div>
    <details className="material-catalog-product"><summary><span><strong>Nuevo producto</strong><small>Crear una ficha completa en el catálogo público</small></span><b>Añadir</b></summary>
      <form action={updateMaterialProductAction} className="material-form-grid"><input type="hidden" name="productId" value="" /><label>Nombre<input name="name" required /></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>Referencia proveedor<input name="supplierReference" required /></label><label>Categoría<input name="category" required /></label><label>Marca<input name="brand" /></label><label>Nivel recomendado<input name="recommendedLevel" /></label><label>Gramaje<input name="weight" /></label><label>Orden<input name="sortOrder" type="number" min="0" defaultValue="0" required /></label><label>Imagen<input name="imageUrl" placeholder="assets/products/... o https://..." /></label><label>Fuente<input name="sourceUrl" type="url" /></label><label className="material-wide">Atribución de imagen<input name="imageAttribution" /></label><label className="material-wide">Descripción<textarea name="description" rows={3} /></label><label className="check-row"><input name="active" type="checkbox" defaultChecked /> Producto visible</label><div className="material-form-action"><SubmitButton pendingLabel="Creando producto...">Crear producto</SubmitButton></div></form>
    </details>
    <div className="material-catalog-list">{products.length ? products.map((product) => <details key={product.id} className="material-catalog-product"><summary><span><strong>{product.name}</strong><small>{product.slug} · {product.variants.length} variantes · {product.is_active ? "visible" : "oculto"}</small></span><b>Editar</b></summary>
      <form action={updateMaterialProductAction} className="material-form-grid"><input type="hidden" name="productId" value={product.id} /><label>Nombre<input name="name" defaultValue={product.name} required /></label><label>Slug<input name="slug" defaultValue={product.slug} required /></label><label>Referencia proveedor<input name="supplierReference" defaultValue={product.supplier_reference} required /></label><label>Categoría<input name="category" defaultValue={product.category ?? ""} required /></label><label>Marca<input name="brand" defaultValue={product.brand ?? ""} /></label><label>Nivel recomendado<input name="recommendedLevel" defaultValue={product.recommended_level ?? ""} /></label><label>Gramaje<input name="weight" defaultValue={product.weight ?? ""} /></label><label>Orden<input name="sortOrder" type="number" min="0" defaultValue={product.sort_order} required /></label><label>Imagen<input name="imageUrl" defaultValue={product.image_url ?? ""} /></label><label>Fuente<input name="sourceUrl" type="url" defaultValue={product.source_url ?? ""} /></label><label className="material-wide">Atribución de imagen<input name="imageAttribution" defaultValue={product.image_attribution ?? ""} /></label><label className="material-wide">Descripción<textarea name="description" rows={2} defaultValue={product.description ?? ""} /></label><label className="check-row"><input name="active" type="checkbox" defaultChecked={product.is_active} /> Producto visible</label><div className="material-form-action"><SubmitButton pendingLabel="Guardando producto...">Guardar producto</SubmitButton></div></form>
      <details className="material-catalog-product"><summary><span><strong>Nueva variante</strong><small>SKU, talla, precio y disponibilidad</small></span><b>Añadir</b></summary><form action={createMaterialVariantAction} className="material-variant-row"><input type="hidden" name="productId" value={product.id} /><label>SKU<input name="sku" required /></label><label>Talla<input name="size" required /></label><label>Ref. proveedor<input name="supplierReference" defaultValue={product.supplier_reference} required /></label><label>Coste (ct.)<input name="costCents" type="number" min="0" step="1" required /></label><label>Margen (ct.)<input name="marginCents" type="number" step="1" required /></label><label>Precio público (ct.)<input name="priceCents" type="number" min="0" step="1" required /></label><label>Base de coste<input name="costBasis" required /></label><label>Promoción (ct.)<input name="promotionPriceCents" type="number" min="0" step="1" /></label><label>Desde<input name="promotionStartsOn" type="date" /></label><label>Hasta<input name="promotionEndsOn" type="date" /></label><label>Orden<input name="sortOrder" type="number" min="0" defaultValue={product.variants.length} required /></label><label className="check-row"><input name="promotionActive" type="checkbox" /> Promoción activa</label><label className="check-row"><input name="active" type="checkbox" defaultChecked /> Disponible</label><SubmitButton className="mini-action" pendingLabel="Creando...">Crear variante</SubmitButton></form></details>
      <div className="material-variant-list">{product.variants.map((variant) => <VariantForm key={variant.id} variant={variant} />)}</div>
    </details>) : <EmptyState title="Catálogo vacío" detail="No hay productos publicados en la base de datos de la web." />}</div>
  </section></div>;
}

function VariantForm({ variant }: { variant: CatalogProduct["variants"][number] }) {
  return <form action={updateMaterialVariantAction} className="material-variant-row"><input type="hidden" name="variantId" value={variant.id} /><div className="material-variant-id"><strong>{variant.sku}</strong><span>{variant.name}</span></div><label>Coste (ct.)<input name="costCents" type="number" min="0" step="1" defaultValue={variant.cost_cents} required /></label><label>Margen (ct.)<input name="marginCents" type="number" step="1" defaultValue={variant.margin_cents} required /></label><label>Precio final (ct.)<input name="priceCents" type="number" min="0" step="1" defaultValue={variant.price_cents} required /></label><label>Base de coste<input name="costBasis" defaultValue={variant.cost_basis} required /></label><label>Promoción (ct.)<input name="promotionPriceCents" type="number" min="0" step="1" defaultValue={variant.promotion_price_cents ?? ""} /></label><label>Desde<input name="promotionStartsOn" type="date" defaultValue={dateInputValue(variant.promotion_starts_at)} /></label><label>Hasta<input name="promotionEndsOn" type="date" defaultValue={dateInputValue(variant.promotion_ends_at)} /></label><label className="check-row"><input name="promotionActive" type="checkbox" defaultChecked={variant.promotion_is_active} /> Promoción activa</label><label className="check-row"><input name="active" type="checkbox" defaultChecked={variant.is_active} /> Disponible</label><SubmitButton className="mini-action" pendingLabel="Guardando...">Guardar</SubmitButton></form>;
}

function dateInputValue(value: string | null) { return value ? value.slice(0, 10) : ""; }

function HistoryView({ campaigns, orders }: { campaigns: CampaignView[]; orders: CampaignOrder[] }) {
  return <div className="material-tab-panel"><section className="material-section"><div className="material-section-heading"><div><h2>Histórico de campañas</h2><p>Las campañas cerradas mantienen sus precios y líneas originales.</p></div><span>{campaigns.length} campañas</span></div><div className="material-history-list">{campaigns.length ? campaigns.map((campaign) => { const campaignOrders = orders.filter((order) => order.campaign_id === campaign.id); const totals = summarize(campaignOrders); return <div key={campaign.id}><span className={`material-status status-${campaign.status}`}>{statusLabel(campaign.status)}</span><div><strong>{formatPeriod(campaign)}</strong><small>{totals.orderCount} pedidos · {totals.articleCount} artículos</small></div><b>{money(totals.totalCents)}</b></div>; }) : <p className="muted">Todavía no hay campañas.</p>}</div></section></div>;
}

function OrderLinesTable({ orders, query, product, size, orderStatus }: { orders: CampaignOrder[]; query: string; product: string; size: string; orderStatus: string }) {
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const lines = orders.flatMap((order) => order.items.map((item) => ({ order, item }))).filter(({ order, item }) => {
    if (product && item.product_name !== product) return false;
    if (size && item.variant_name !== size) return false;
    if (orderStatus && order.status !== orderStatus) return false;
    if (!normalizedQuery) return true;
    return [order.customer_name, order.order_number, itemRecipient(item)].some((value) => value?.toLocaleLowerCase("es").includes(normalizedQuery));
  });
  return <div className="table-wrap material-table"><table><thead><tr><th>Responsable</th><th>Destinatario</th><th>Producto</th><th>Referencia</th><th>Talla</th><th>Cant.</th><th>Precio</th></tr></thead><tbody>{lines.length ? lines.map(({ order, item }) => <tr key={item.id}><td data-label="Responsable"><strong>{order.customer_name}</strong><small>{order.order_number ?? "Sin número"}</small></td><td data-label="Destinatario">{itemRecipient(item)}</td><td data-label="Producto">{item.product_name}</td><td data-label="Referencia">{supplierReference(item.sku)}</td><td data-label="Talla">{item.variant_name}</td><td data-label="Cant.">{item.quantity}</td><td data-label="Precio"><strong>{money(item.line_total_cents)}</strong><small>{money(item.unit_price_cents)} / ud.</small></td></tr>) : <tr><td colSpan={7} className="muted">No hay artículos en esta campaña.</td></tr>}</tbody></table></div>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div><span>{icon}{label}</span><strong>{value}</strong></div>; }
function CloseCampaignButton({ disabled }: { disabled: boolean }) { const { pending } = useFormStatus(); return <button type="submit" className="danger-button" disabled={disabled || pending} aria-busy={pending}>{pending ? "Cerrando campaña..." : "Cerrar campaña"}</button>; }
function PaymentSubmitButton({ disabled }: { disabled: boolean }) { const { pending } = useFormStatus(); return <button type="submit" className="mini-action" disabled={disabled || pending} aria-busy={pending}>{pending ? "..." : "Guardar"}</button>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="material-empty"><strong>{title}</strong><span>{detail}</span></div>; }
function summarize(orders: CampaignOrder[]) { return { orderCount: orders.length, articleCount: orders.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0), totalCents: orders.reduce((sum, order) => sum + (order.total_cents ?? order.items.reduce((itemSum, item) => itemSum + item.line_total_cents, 0)), 0) }; }
function unresolvedOrderCount(orders: CampaignOrder[]) { return orders.filter((order) => order.status !== "cancelled" && (!order.customer_email?.trim() || !order.customer_phone?.trim() || !order.payment_method)).length; }
function money(cents: number) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100); }
function formatPeriod(campaign: CampaignView) { return `${formatDate(campaign.period_start)} - ${formatDate(campaign.period_end)}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(`${value}T12:00:00Z`)); }
function statusLabel(status: ManagementCampaignStatus) { return status === "open" ? "Abierta" : status === "pending_close" ? "Pendiente de cierre" : "Cerrada"; }
function campaignMessage(campaign: CampaignView) { return campaign.status === "closed" ? "Campaña cerrada; los pedidos y precios están congelados." : campaign.status === "pending_close" ? "Periodo vencido, pendiente de revisión y cierre manual." : "Recibiendo pedidos desde la web pública."; }
function daysLabel(campaign: CampaignView) { if (campaign.status === "closed") return "Cerrada"; const today = new Date(); const end = new Date(`${campaign.period_end}T23:59:59+02:00`); const days = Math.ceil((end.getTime() - today.getTime()) / 86400000); return days < 0 ? `${Math.abs(days)} días vencida` : days === 0 ? "Termina hoy" : `${days} días`; }
function supplierReference(sku: string) { return sku.includes("-") ? sku.slice(0, sku.lastIndexOf("-")) : sku; }
function itemRecipient(item: CampaignOrder["items"][number]) { return item.recipient?.trim() || "Sin indicar"; }
function familyRecipients(value: WebOrderJson) {
  if (!Array.isArray(value)) return "Pedido familiar";
  const names = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return names.length ? names.join(", ") : "Pedido familiar";
}
function familyItems(value: WebOrderJson) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || Array.isArray(raw) || typeof raw !== "object") return [];
    const item = raw as Record<string, WebOrderJson | undefined>;
    const product = typeof item.product_name === "string" ? item.product_name : "Artículo";
    const variant = typeof item.variant_name === "string" ? item.variant_name : typeof item.size === "string" ? item.size : "";
    const recipient = typeof item.recipient === "string" ? item.recipient : "";
    const quantity = typeof item.quantity === "number" ? item.quantity : 1;
    const cents = typeof item.line_total_cents === "number" ? item.line_total_cents : typeof item.total_cents === "number" ? item.total_cents : 0;
    return [{ label: [recipient, product, variant, quantity > 1 ? `${quantity} ud.` : ""].filter(Boolean).join(" · "), amount: money(cents) }];
  });
}
function paymentMethodLabel(method: WebOrderFamilyPayment["intended_payment_method"]) { return method === "cash" ? "Previsto en efectivo" : method === "bank" ? "Previsto por cuenta" : method === "paid" ? "Ya constaba pagado" : "Formas de pago combinadas"; }
function confirmClose(event: FormEvent<HTMLFormElement>, orders: number, communications: number) { if (!window.confirm(`Vas a cerrar ${orders} pedidos y preparar ${communications} comunicaciones. No se enviará ningún email. ¿Continuar?`)) event.preventDefault(); }
export function csvCell(value: string | number) { const text = String(value); const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text; return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText; }
function exportSupplierCsv(rows: SupplierSummaryRow[]) { const headers = ["Referencia", "Producto", "Talla", "Cantidad", "Coste unitario", "Coste total"]; const lines = rows.map((row) => [row.supplierReference, row.productName, row.size, row.quantity, (row.unitCostCents / 100).toFixed(2), (row.totalCostCents / 100).toFixed(2)]); const blob = new Blob(["\uFEFF" + [headers, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "pedido-proveedor.csv"; link.click(); URL.revokeObjectURL(url); }
