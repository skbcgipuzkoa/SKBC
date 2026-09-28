"use client";

import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, Download, PackageCheck, ReceiptText, UsersRound } from "lucide-react";
import { SubmitButton } from "@/app/components/SubmitButton";
import {
  assignMaterialPaymentAction,
  closeMaterialCampaignAction,
  sendMaterialCampaignCommunicationsAction,
  updateMaterialProductAction,
  updateMaterialVariantAction
} from "@/app/material-order-actions";
import type { CampaignOrder, CatalogProduct, SupplierSummaryRow } from "@/lib/web-orders/repository";
import type { ManagementCampaignStatus } from "@/lib/web-orders/campaigns";
import type { WebOrderCampaign, WebOrderCommunication, WebOrderJson } from "@/lib/web-orders/types";

type CampaignView = Omit<WebOrderCampaign, "status"> & { status: ManagementCampaignStatus };
type CommunicationView = WebOrderCommunication & {
  status?: "prepared" | "sent" | "failed" | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  failure_message?: string | null;
};

export type MaterialOrdersDashboardProps = {
  campaign: CampaignView | null;
  campaigns: CampaignView[];
  orders: CampaignOrder[];
  historyOrders: CampaignOrder[];
  supplierSummary: SupplierSummaryRow[];
  catalog: CatalogProduct[];
  communications: CommunicationView[];
  loadError?: string;
  children: ReactNode;
};

const tabs = [
  ["monthly", "Material mensual"],
  ["supplier", "Resumen proveedor"],
  ["payments", "Cobros y comunicaciones"],
  ["catalog", "Catálogo"],
  ["history", "Histórico"],
  ["belts", "Cinturones internos"]
] as const;

type TabId = (typeof tabs)[number][0];

export function MaterialOrdersDashboard(props: MaterialOrdersDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>(props.loadError ? "belts" : "monthly");
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
    <nav className="material-tabs" aria-label="Vistas de pedidos" role="tablist">
      {tabs.map(([id, label]) => <button key={id} ref={(element) => { tabRefs.current[id] = element; }} id={`material-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`material-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} onClick={() => setActiveTab(id)} onKeyDown={(event) => selectAdjacentTab(event, id)}>{label}</button>)}
    </nav>

    {props.loadError ? <div className="material-alert material-alert-danger" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span><strong>Pedidos mensuales no disponibles.</strong> {props.loadError}</span></div> : null}

    <div id="material-panel-monthly" role="tabpanel" aria-labelledby="material-tab-monthly" hidden={activeTab !== "monthly"}>{activeTab === "monthly" ? <MonthlyView {...props} totals={totals} unresolved={unresolved} /> : null}</div>
    <div id="material-panel-supplier" role="tabpanel" aria-labelledby="material-tab-supplier" hidden={activeTab !== "supplier"}>{activeTab === "supplier" ? <SupplierView rows={props.supplierSummary} campaign={props.campaign} /> : null}</div>
    <div id="material-panel-payments" role="tabpanel" aria-labelledby="material-tab-payments" hidden={activeTab !== "payments"}>{activeTab === "payments" ? <PaymentsView orders={props.orders} communications={props.communications} campaign={props.campaign} /> : null}</div>
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
  const expectedCommunications = new Set(orders.map((order) => order.customer_email?.trim().toLowerCase()).filter(Boolean)).size;
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

function PaymentsView({ orders, communications, campaign }: { orders: CampaignOrder[]; communications: CommunicationView[]; campaign: CampaignView | null }) {
  const communicationIds = JSON.stringify(communications.map((communication) => communication.id));
  const pendingCount = communications.filter((communication) => communication.status !== "sent").length;
  const sentCount = communications.filter((communication) => communication.status === "sent").length;
  return <div className="material-tab-panel">
    <section className="material-section">
      <div className="material-section-heading"><div><h2>Cobros</h2><p>La forma de pago se asigna por responsable y se incluirá en la comunicación preparada.</p></div></div>
      <div className="material-payment-list">{orders.length ? orders.map((order) => <div className="material-payment-row" key={order.id}><div><strong>{order.customer_name}</strong><span>{order.order_number ?? "Sin número"} · {order.customer_email ?? "Sin email"}</span></div><strong>{money(order.total_cents ?? order.items.reduce((sum, item) => sum + item.line_total_cents, 0))}</strong><form action={assignMaterialPaymentAction}><input type="hidden" name="orderId" value={order.id} /><select name="paymentMethod" defaultValue={order.payment_method ?? ""} aria-label={`Pago de ${order.customer_name}`} required disabled={campaign?.status !== "open"}><option value="" disabled>Asignar pago</option><option value="cash">Entregar en el club</option><option value="bank">Cargar en cuenta</option><option value="paid">Pagado</option></select><PaymentSubmitButton disabled={campaign?.status !== "open"} /></form></div>) : <p className="muted">No hay pedidos en la campaña.</p>}</div>
    </section>
    <section className="material-section">
      <div className="material-section-heading"><div><h2>Comunicaciones</h2><p>{campaign?.status === "closed" ? "Revisa los destinatarios y envía primero una prueba interna. Cada familia recibe únicamente su pedido." : "Se prepararán al cerrar la campaña; nunca se envían automáticamente."}</p></div><span>{pendingCount} pendientes · {sentCount} enviadas</span></div>
      {communications.length ? <><div className="material-communication-list">{communications.map((communication) => <details key={communication.id}><summary><span><strong>{communication.recipient_name || communication.subject || "Comunicación de pedido"}</strong><small>{communication.recipient_email ?? "Sin email"} · {communication.status ?? "preparada"}</small></span><b>Revisar</b></summary>{communication.body ? <pre>{communication.body}</pre> : <p className="muted">El email profesional se generará desde la instantánea congelada del pedido.</p>}{communication.failure_message ? <p className="form-error">{communication.failure_message}</p> : null}</details>)}</div>
        {campaign?.status === "closed" ? <div className="material-campaign-actions">
          <form action={sendMaterialCampaignCommunicationsAction}><input type="hidden" name="communicationIds" value={communicationIds} /><button className="secondary-button" type="submit" name="mode" value="test">Enviar prueba al club</button></form>
          <form action={sendMaterialCampaignCommunicationsAction} onSubmit={(event) => { if (!window.confirm(`Se procesarán ${pendingCount} comunicaciones pendientes, una por familia. ¿Continuar?`)) event.preventDefault(); }}><input type="hidden" name="communicationIds" value={communicationIds} /><button type="submit" name="mode" value="send" disabled={!pendingCount}>Enviar pendientes</button></form>
          {sentCount ? <form action={sendMaterialCampaignCommunicationsAction} onSubmit={(event) => { if (!window.confirm(`Esto reenviará también ${sentCount} comunicaciones ya enviadas. ¿Confirmas el reenvío forzado?`)) event.preventDefault(); }}><input type="hidden" name="communicationIds" value={communicationIds} /><input type="hidden" name="forceConfirmed" value="yes" /><button className="danger-button" type="submit" name="mode" value="force-resend">Forzar reenvío de todas</button></form> : null}
        </div> : null}</> : <EmptyState title="Sin comunicaciones preparadas" detail="Cierra la campaña cuando todos los datos estén revisados." />}
    </section>
  </div>;
}

function CatalogView({ products }: { products: CatalogProduct[] }) {
  return <div className="material-tab-panel"><section className="material-section"><div className="material-section-heading"><div><h2>Catálogo público</h2><p>Coste, margen, precio final, disponibilidad y promoción por variante.</p></div><span>{products.length} productos</span></div>
    <div className="material-catalog-list">{products.length ? products.map((product) => <details key={product.id} className="material-catalog-product"><summary><span><strong>{product.name}</strong><small>{product.slug} · {product.variants.length} variantes · {product.is_active ? "visible" : "oculto"}</small></span><b>Editar</b></summary>
      <form action={updateMaterialProductAction} className="material-form-grid"><input type="hidden" name="productId" value={product.id} /><label>Nombre<input name="name" defaultValue={product.name} required /></label><label>Slug<input name="slug" defaultValue={product.slug} required /></label><label>Orden<input name="sortOrder" type="number" min="0" defaultValue={product.sort_order} required /></label><label>Imagen<input name="imageUrl" type="url" defaultValue={product.image_url ?? ""} /></label><label className="material-wide">Descripción<textarea name="description" rows={2} defaultValue={product.description ?? ""} /></label><label className="check-row"><input name="active" type="checkbox" defaultChecked={product.is_active} /> Producto visible</label><div className="material-form-action"><SubmitButton pendingLabel="Guardando producto...">Guardar producto</SubmitButton></div></form>
      <div className="material-variant-list">{product.variants.map((variant) => <VariantForm key={variant.id} variant={variant} />)}</div>
    </details>) : <EmptyState title="Catálogo vacío" detail="No hay productos publicados en la base de datos de la web." />}</div>
  </section></div>;
}

function VariantForm({ variant }: { variant: CatalogProduct["variants"][number] }) {
  const attrs = objectAttributes(variant.attributes);
  const cost = numericAttr(attrs, "cost_cents", Math.max(0, variant.unit_price_cents - 500));
  const margin = numericAttr(attrs, "margin_cents", variant.unit_price_cents - cost);
  return <form action={updateMaterialVariantAction} className="material-variant-row"><input type="hidden" name="variantId" value={variant.id} /><input type="hidden" name="attributes" value={JSON.stringify(attrs)} /><div className="material-variant-id"><strong>{variant.sku}</strong><span>{variant.name}</span></div><label>Coste (ct.)<input name="costCents" type="number" min="0" step="1" defaultValue={cost} required /></label><label>Margen (ct.)<input name="marginCents" type="number" step="1" defaultValue={margin} required /></label><label>Precio final (ct.)<input name="unitPriceCents" type="number" min="0" step="1" defaultValue={variant.unit_price_cents} required /></label><label>Promoción (ct.)<input name="promotionPriceCents" type="number" min="0" step="1" defaultValue={numericAttr(attrs, "promotion_price_cents", "")} /></label><label>Desde<input name="promotionStartsOn" type="date" defaultValue={stringAttr(attrs, "promotion_starts_on")} /></label><label>Hasta<input name="promotionEndsOn" type="date" defaultValue={stringAttr(attrs, "promotion_ends_on")} /></label><label className="check-row"><input name="active" type="checkbox" defaultChecked={variant.is_active} /> Disponible</label><SubmitButton className="mini-action" pendingLabel="Guardando...">Guardar</SubmitButton></form>;
}

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
function unresolvedOrderCount(orders: CampaignOrder[]) { return orders.filter((order) => !order.customer_email?.trim() || !order.customer_phone?.trim() || !order.payment_method).length; }
function money(cents: number) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100); }
function formatPeriod(campaign: CampaignView) { return `${formatDate(campaign.period_start)} - ${formatDate(campaign.period_end)}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(new Date(`${value}T12:00:00Z`)); }
function statusLabel(status: ManagementCampaignStatus) { return status === "open" ? "Abierta" : status === "pending_close" ? "Pendiente de cierre" : "Cerrada"; }
function campaignMessage(campaign: CampaignView) { return campaign.status === "closed" ? "Campaña cerrada; los pedidos y precios están congelados." : campaign.status === "pending_close" ? "Periodo vencido, pendiente de revisión y cierre manual." : "Recibiendo pedidos desde la web pública."; }
function daysLabel(campaign: CampaignView) { if (campaign.status === "closed") return "Cerrada"; const today = new Date(); const end = new Date(`${campaign.period_end}T23:59:59+02:00`); const days = Math.ceil((end.getTime() - today.getTime()) / 86400000); return days < 0 ? `${Math.abs(days)} días vencida` : days === 0 ? "Termina hoy" : `${days} días`; }
function supplierReference(sku: string) { return sku.includes("-") ? sku.slice(0, sku.lastIndexOf("-")) : sku; }
function itemRecipient(item: CampaignOrder["items"][number]) { const raw = item as unknown as { recipient?: string | null }; return raw.recipient?.trim() || "Sin indicar"; }
function objectAttributes(value: WebOrderJson) { return value && !Array.isArray(value) && typeof value === "object" ? value : {}; }
function numericAttr(attrs: Record<string, WebOrderJson | undefined>, key: string, fallback: number): number;
function numericAttr(attrs: Record<string, WebOrderJson | undefined>, key: string, fallback: ""): number | "";
function numericAttr(attrs: Record<string, WebOrderJson | undefined>, key: string, fallback: number | "") { const value = attrs[key]; return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function stringAttr(attrs: Record<string, WebOrderJson | undefined>, key: string) { return typeof attrs[key] === "string" ? attrs[key] as string : ""; }
function confirmClose(event: FormEvent<HTMLFormElement>, orders: number, communications: number) { if (!window.confirm(`Vas a cerrar ${orders} pedidos y preparar ${communications} comunicaciones. No se enviará ningún email. ¿Continuar?`)) event.preventDefault(); }
export function csvCell(value: string | number) { const text = String(value); const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text; return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText; }
function exportSupplierCsv(rows: SupplierSummaryRow[]) { const headers = ["Referencia", "Producto", "Talla", "Cantidad", "Coste unitario", "Coste total"]; const lines = rows.map((row) => [row.supplierReference, row.productName, row.size, row.quantity, (row.unitCostCents / 100).toFixed(2), (row.totalCostCents / 100).toFixed(2)]); const blob = new Blob(["\uFEFF" + [headers, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "pedido-proveedor.csv"; link.click(); URL.revokeObjectURL(url); }
